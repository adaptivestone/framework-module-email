import fs from 'node:fs';
import path from 'node:path';
import * as url from 'node:url';
import { promisify } from 'node:util';
import merge from 'deepmerge';
import { convert } from 'html-to-text';
import juice from 'juice';
import nodemailer from 'nodemailer';
import type { Options as SMTPTransportOptions } from 'nodemailer/lib/smtp-transport/index.d.ts';
import stub from 'nodemailer-stub-transport';
import defaultMailConfig from './config/mail.ts';
import type { TMinimalApp, TMinimalI18n, TTemplateEngine } from './types.d.ts';

const mailTransports = {
  stub,
  smtp: (data: SMTPTransportOptions) => data,
};

/**
 * Engine that simply reads the file as-is (html, plain text, css).
 */
const passthroughEngine: TTemplateEngine = (fullPath) =>
  fs.promises.readFile(fullPath, { encoding: 'utf8' });

/**
 * Registry mapping a file extension (without the dot, lower-cased) to the engine
 * that renders it. By design this module ships ONLY plain-text engines and has
 * no template-engine dependency of its own. Register engines such as
 * pug / ejs / handlebars yourself via `Mail.registerTemplateEngine`.
 */
const templateEngines = new Map<string, TTemplateEngine>([
  ['html', passthroughEngine],
  ['text', passthroughEngine],
  ['css', passthroughEngine],
]);

const normalizeExtension = (extension: string) =>
  extension.toLowerCase().replace(/^\./, '');

// Restrict juice's style->attribute mapping to <table> only (not td/th/tr/...).
// Set once at module load; it mutates a shared juice singleton.
// @ts-expect-error juice's types do not expose tableElements
juice.tableElements = ['TABLE'];

const juiceResourcesAsync = promisify(juice.juiceResources);

class Mail {
  /**
   * Adaptive stone framework application
   */
  app!: TMinimalApp;
  /**
   * Template full path
   */
  template = '';

  /**
   * Data to render in template. Object with value that available inside template
   * @type {object}
   */
  templateData = {};

  /**
   * Locale to render template
   * @type {string}
   */
  locale = 'en';

  /**
   * i18n object. Fallback if you have no real i18n object
   */
  i18n: TMinimalI18n = {
    t: (str: string) => str,
    language: 'en', // todo change it to config
  };

  /**
   * Construct mail class
   * @param {TMinimalI18n} app
   * @param {string} template template name
   * @param {object} [templateData={}] data to render in template. Object with value that available inside template
   * @param {object} [i18n] data to render in template
   */
  constructor(
    app: TMinimalApp,
    template: string,
    templateData = {},
    i18n: TMinimalI18n | null = null,
  ) {
    this.app = app;
    const dirname = url.fileURLToPath(new URL('.', import.meta.url));
    this.template = template;
    if (!path.isAbsolute(this.template)) {
      // first go to emails folder
      if (
        fs.existsSync(
          `${this.app.foldersConfig.emails}/${path.basename(template)}`,
        )
      ) {
        this.template = `${this.app.foldersConfig.emails}/${path.basename(
          template,
        )}`;
      } else if (
        this.app.frameworkFolder &&
        fs.existsSync(
          `${this.app.frameworkFolder}/services/messaging/email/templates/${path.basename(template)}`,
        )
      ) {
        this.template = `${this.app.frameworkFolder}/services/messaging/email/templates/${path.basename(template)}`;
      } else if (
        // now try to find in templates folder locally
        fs.existsSync(
          path.join(dirname, `/templates/${path.basename(template)}`),
        )
      ) {
        this.template = path.join(
          dirname,
          `/templates/${path.basename(template)}`,
        );
      } else {
        // looks like we have no template. Using empty template
        this.template = path.join(dirname, `/templates/emptyTemplate`);
        this.app.logger.error(
          `Template '${template}' not found. Using 'emptyTemplate' as a fallback`,
        );
      }
    }
    this.templateData = templateData;
    if (i18n) {
      this.i18n = i18n;
      this.locale = this.i18n?.language ?? this.locale;
    }
  }

  /**
   * Render template
   * @param {object} type and fullpath
   * @param {object} templateData
   * @returns string
   */
  async #renderTemplateFile(
    template: { type: string; fullPath: string },
    templateData = {},
  ) {
    if (!template?.type || !template.fullPath) {
      return null;
    }

    const engine = templateEngines.get(normalizeExtension(template.type));
    if (!engine) {
      throw new Error(`Template type ${template.type} is not supported`);
    }
    return engine(template.fullPath, templateData);
  }
  /**
   * Render template
   * @return {Promise}
   */
  async renderTemplate() {
    const files = await fs.promises.readdir(this.template);
    const templates: {
      [key: string]: {
        type: string;
        fullPath: string;
      };
    } = {};
    for (const file of files) {
      const { name, ext } = path.parse(file);
      templates[name] = {
        type: ext.slice(1),
        fullPath: path.join(this.template, file),
      };
    }

    if (!templates.html || !templates.subject) {
      throw new Error(
        'Template HTML and Subject must be provided. Please follow documentation for details https://framework.adaptivestone.com/docs/email',
      );
    }
    const mailConfig = Mail.getConfig(this.app);

    const templateDataToRender = {
      locale: this.locale,
      t: this.i18n.t.bind(this.i18n),
      ...mailConfig.globalVariablesToTemplates,
      ...this.templateData,
    };

    const [htmlRendered, subjectRendered, textRendered, extraCss] =
      await Promise.all([
        this.#renderTemplateFile(templates.html, templateDataToRender),
        this.#renderTemplateFile(templates.subject, templateDataToRender),
        this.#renderTemplateFile(templates.text, templateDataToRender),
        this.#renderTemplateFile(templates.style),
      ]);

    if (!htmlRendered) {
      throw new Error('HTML template cant be rendered');
    }

    const inlinedHTML = await juiceResourcesAsync(htmlRendered, {
      preserveImportant: true,
      webResources: mailConfig.webResources,
      extraCss: extraCss ?? '',
    });
    return {
      htmlRaw: htmlRendered,
      subject: subjectRendered ?? '',
      text: textRendered ?? '',
      inlinedHTML,
    };
  }
  /**
   * Send email
   * @param {string | Array<string>} to email send to
   * @param {string} [from = mailConfig.from]
   * @param {object} [aditionalNodemailerOptions = {}] additional option to nodemailer
   * @return {Promise}
   */
  async send(
    to: string | Array<string>,
    from: string = '',
    aditionalNodemailerOptions = {},
  ) {
    const { subject, text, inlinedHTML } = await this.renderTemplate();

    return Mail.sendRaw(
      this.app,
      to,
      subject,
      inlinedHTML,
      text,
      from,
      aditionalNodemailerOptions,
    );
  }

  /**
   * Send provided text (html) to email. Low level function. All data should be prepared before sending (like inline styles)
   * @param {TMinimalI18n} app application
   * @param {string | Array<string>} to send to
   * @param {string} subject email topic
   * @param {string} html hmlt body of emain
   * @param {string} [text] if not provided will be generated from html string
   * @param {string} [from = mailConfig.from] from. If not provided will be grabbed from config
   * @param {object} [additionalNodeMailerOption = {}] any otipns to pass to nodemailer  https://nodemailer.com/message/
   */
  static async sendRaw(
    app: TMinimalApp,
    to: string | Array<string>,
    subject: string,
    html: string,
    text: string = '',
    from: string = '',
    additionalNodeMailerOption = {},
  ) {
    if (!app || !to || !subject || !html) {
      throw new Error('App, to, subject and html is required fields.');
    }
    const mailConfig = Mail.getConfig(app);
    if (!from) {
      from = mailConfig.from ?? '';
    }

    if (!text) {
      text = convert(html, {
        selectors: [{ selector: 'img', format: 'skip' }],
      });
    }
    const transport = mailConfig.transport ?? 'smtp';
    const transports = mailConfig.transports ?? {};
    const transportConfig = transports[transport];
    if (!transportConfig) {
      throw new Error(`Transport config for '${transport}' is not defined`);
    }
    const transportFn = mailTransports[transport];
    const transporter = nodemailer.createTransport(
      transportFn(transportConfig),
    );

    return transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
      ...additionalNodeMailerOption,
    });
  }

  /**
   * Get final config. Method to get final config.
   * @param {TMinimalI18n} app application
   */
  static getConfig(app: TMinimalApp): typeof defaultMailConfig {
    const mailConfig = app.getConfig('mail');
    return merge(defaultMailConfig, mailConfig || {});
  }

  /**
   * Register (or override) a template engine for a given file extension.
   * The engine receives the absolute path to the template file and the data to
   * render, and returns the rendered string (sync or async).
   *
   * @example
   * import ejs from 'ejs';
   * Mail.registerTemplateEngine('ejs', (fullPath, data) =>
   *   ejs.renderFile(fullPath, data),
   * );
   *
   * @param {string} extension file extension, with or without a leading dot (case-insensitive)
   * @param {TTemplateEngine} engine function that renders a template file
   */
  static registerTemplateEngine(extension: string, engine: TTemplateEngine) {
    if (!extension || typeof engine !== 'function') {
      throw new Error(
        'registerTemplateEngine requires a non-empty extension and an engine function',
      );
    }
    templateEngines.set(normalizeExtension(extension), engine);
  }

  /**
   * Remove a previously registered template engine.
   * @param {string} extension file extension, with or without a leading dot (case-insensitive)
   * @returns {boolean} true if an engine was registered and is now removed
   */
  static unregisterTemplateEngine(extension: string): boolean {
    return templateEngines.delete(normalizeExtension(extension));
  }

  /**
   * Check whether an engine is registered for the given file extension.
   * @param {string} extension file extension, with or without a leading dot (case-insensitive)
   * @returns {boolean}
   */
  static hasTemplateEngine(extension: string): boolean {
    return templateEngines.has(normalizeExtension(extension));
  }
}

export default Mail;
