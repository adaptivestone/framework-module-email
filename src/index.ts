import fs from 'node:fs';
import path from 'node:path';
import * as url from 'node:url';
import { promisify } from 'node:util';
import nodemailer from 'nodemailer';
import stub from 'nodemailer-stub-transport';
import pug from 'pug';
import juice from 'juice';
import { convert } from 'html-to-text';
import merge from 'deepmerge';
import defaultMailConfig from './config/mail.ts';
import type { Options as SMTPTransportOptions } from 'nodemailer/lib/smtp-transport/index.d.ts';
import type { TMinimalI18n, TMinimalApp } from './types.d.ts';

const mailTransports = {
  stub,
  smtp: (data: SMTPTransportOptions) => data,
};

class Mail {
  /**
   * Adaptive stone framework application
   */
  app: TMinimalApp = null;
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
    if (!path.isAbsolute(template)) {
      if (
        fs.existsSync(
          `${this.app.foldersConfig.emails}/${path.basename(template)}`,
        )
      ) {
        this.template = `${this.app.foldersConfig.emails}/${path.basename(
          template,
        )}`;
      } else if (
        fs.existsSync(
          path.join(dirname, `/templates/${path.basename(template)}`),
        )
      ) {
        this.template = path.join(
          dirname,
          `/templates/${path.basename(template)}`,
        );
      } else {
        this.template = path.join(dirname, `/templates/emptyTemplate`);
        this.app.logger.error(
          `Template '${template}' not found. Using 'emptyTemplate' as a fallback`,
        );
      }
    }
    this.templateData = templateData;
    if (i18n) {
      this.i18n = i18n;
      this.locale = this.i18n?.language;
    }
  }

  /**
   * Render template
   * @param {object} type and fullpath
   * @param {object} templateData
   * @returns string
   */
  async #renderTemplateFile(
    { type, fullPath }: { type?: string; fullPath?: string } = {},
    templateData = {},
  ) {
    if (!type || !fullPath) {
      return null;
    }

    switch (type) {
      case 'html':
      case 'text':
      case 'css':
        return fs.promises.readFile(fullPath, { encoding: 'utf8' });
      case 'pug': {
        const compiledFunction = pug.compileFile(fullPath);
        return compiledFunction(templateData);
      }
      default:
        throw new Error(`Template type ${type} is not supported`);
    }
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
      const [name, extension] = file.split('.');
      templates[name] = {
        type: extension,
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

    // @ts-ignore
    juice.tableElements = ['TABLE'];

    const juiceResourcesAsync = promisify(juice.juiceResources);

    const inlinedHTML = await juiceResourcesAsync(htmlRendered, {
      preserveImportant: true,
      webResources: mailConfig.webResources,
      extraCss,
    });
    return {
      htmlRaw: htmlRendered,
      subject: subjectRendered,
      text: textRendered,
      inlinedHTML,
    };
  }
  /**
   * Send email
   * @param {string} to email send to
   * @param {string} [from = mailConfig.from]
   * @param {object} [aditionalNodemailerOptions = {}] additional option to nodemailer
   * @return {Promise}
   */
  async send(to: string, from: string = null, aditionalNodemailerOptions = {}) {
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
   * @param {string} to send to
   * @param {string} subject email topic
   * @param {string} html hmlt body of emain
   * @param {string} [text] if not provided will be generated from html string
   * @param {string} [from = mailConfig.from] from. If not provided will be grabbed from config
   * @param {object} [additionalNodeMailerOption = {}] any otipns to pass to nodemailer  https://nodemailer.com/message/
   */
  static async sendRaw(
    app: TMinimalApp,
    to: string,
    subject: string,
    html: string,
    text: string = null,
    from: string = null,
    additionalNodeMailerOption = {},
  ) {
    if (!app || !to || !subject || !html) {
      throw new Error('App, to, subject and html is required fields.');
    }
    const mailConfig = Mail.getConfig(app);
    if (!from) {
      from = mailConfig.from;
    }

    if (!text) {
      text = convert(html, {
        selectors: [{ selector: 'img', format: 'skip' }],
      });
    }
    const transportConfig = mailConfig.transports[mailConfig.transport];
    const transport = mailTransports[mailConfig.transport];
    const transporter = nodemailer.createTransport(transport(transportConfig));

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
}

export default Mail;
