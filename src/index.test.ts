import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import Mail from '../src/index.ts';
import type { TMinimalApp, TTemplateEngine } from './types.d.ts';

// Minimal stand-in for pug so the suite can exercise `.pug` templates without
// depending on the real pug package (no longer a dependency of this module as
// of v2). Renders pug-style escaped interpolation: `#{ variable }`.
const fakePugEngine: TTemplateEngine = async (fullPath, data) => {
  const source = await readFile(fullPath, 'utf8');
  return source.replace(/#\{\s*(\w+)\s*\}/g, (_, key) =>
    String(data[key] ?? ''),
  );
};

describe('Mail module', () => {
  let mockApp: TMinimalApp;
  let tempDir: string;
  let templateDir: string;

  // Set up files once for all tests
  before(async () => {
    // Pug is no longer bundled (v2). Apps opt in by registering an engine for
    // the `.pug` extension; the suite uses a tiny fake instead of the real pug.
    Mail.registerTemplateEngine('pug', fakePugEngine);

    // Create temporary directory
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'mail-test-'));
    templateDir = path.join(tempDir, 'test-template');

    // Create test template directory
    await mkdir(templateDir, { recursive: true });

    // Create test template files
    await Promise.all([
      writeFile(
        path.join(templateDir, 'html.pug'),
        '<h1>Hello #{name}</h1>\n<div class="content">Welcome</div>',
      ),
      writeFile(path.join(templateDir, 'subject.pug'), 'Welcome #{name}'),
      writeFile(path.join(templateDir, 'style.css'), 'h1 { color: blue; }'),
      writeFile(
        path.join(templateDir, 'text.pug'),
        'Hello #{name}, Welcome to our service!',
      ),
    ]);

    mockApp = {
      foldersConfig: {
        emails: tempDir,
      },
      logger: {
        error: (msg) => {
          console.log(msg);
        },
      },
      getConfig(_configName: 'mail') {
        return {
          from: 'test@test.com',
          transport: 'stub',
        };
      },
      frameworkFolder: '',
    };
  });

  // Clean up files once after all tests
  after(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('config file should be loaded', () => {
    const mail = new Mail(mockApp, 'test');
    const finalConfig = Mail.getConfig(mail.app);
    assert.equal(finalConfig.from, 'test@test.com');
    assert.equal(finalConfig.transport, 'stub');
  });

  describe('Configuration', () => {
    it('should load config file correctly', () => {
      const mail = new Mail(mockApp, 'test');
      const finalConfig = Mail.getConfig(mail.app);
      assert.equal(finalConfig.from, 'test@test.com');
      assert.equal(finalConfig.transport, 'stub');
    });

    it('should merge default config with app config', () => {
      const mail = new Mail(mockApp, 'test');
      const finalConfig = Mail.getConfig(mail.app);
      assert.ok(finalConfig.webResources);
      assert.ok(finalConfig.globalVariablesToTemplates);
    });
  });

  describe('Internationalization', () => {
    it('should use provided i18n object', () => {
      const i18n = {
        t: (str) => `translated_${str}`,
        language: 'fr',
      };

      const mail = new Mail(mockApp, 'test-template', {}, i18n);
      assert.equal(mail.locale, 'fr');
      assert.equal(mail.i18n.t('test'), 'translated_test');
    });

    it('should fallback to default i18n when not provided', () => {
      const mail = new Mail(mockApp, 'test-template');
      assert.equal(mail.locale, 'en');
      assert.equal(mail.i18n.t('test'), 'test');
    });

    it('fallback t honours both i18next default overloads', () => {
      const { t } = new Mail(mockApp, 'test-template').i18n;
      // t(key, 'default')
      assert.equal(t('email.hi', 'Hello there'), 'Hello there');
      // t(key, { defaultValue })
      assert.equal(
        t('email.hi', { defaultValue: 'Hello there' }),
        'Hello there',
      );
      // interpolation options without a default still fall back to the key
      assert.equal(t('email.hi', { name: 'John' }), 'email.hi');
      assert.equal(t('email.hi'), 'email.hi');
    });
  });

  describe('Template handling', () => {
    it('should find and use template from custom path', async () => {
      const mail = new Mail(
        mockApp,
        'test-template',
        { name: 'John' },
        { t: (str) => str, language: 'en' },
      );

      assert.ok(mail.template.includes('test-template'));
    });

    it('should find and use template from absolute path', async () => {
      const mail = new Mail(
        mockApp,
        templateDir,
        { name: 'John' },
        { t: (str) => str, language: 'en' },
      );

      assert.ok(mail.template.includes('test-template'));
    });

    it('should render template with provided data', async () => {
      const mail = new Mail(
        mockApp,
        'test-template',
        { name: 'John' },
        { t: (str) => str, language: 'en' },
      );

      const rendered = await mail.renderTemplate();

      assert.ok(rendered.inlinedHTML.includes('Hello John'));
      assert.ok(rendered.subject.includes('Welcome John'));
      assert.ok(rendered.text.includes('Hello John, Welcome to our service!'));
    });

    it('should handle missing templates gracefully', () => {
      const mail = new Mail(mockApp, 'non-existent-template');
      assert.ok(mail.template.includes('emptyTemplate'));
    });

    it('should properly inline CSS styles', async () => {
      const mail = new Mail(
        mockApp,
        'test-template',
        { name: 'John' },
        { t: (str) => str, language: 'en' },
      );

      const rendered = await mail.renderTemplate();
      assert.ok(rendered.inlinedHTML.includes('color: blue'));
    });

    it('should return error if html on subjet not provided', async () => {
      const templateDirNoSubject = path.join(
        tempDir,
        'test-template-no-subject',
      );
      await mkdir(templateDirNoSubject, { recursive: true });
      await Promise.all([
        writeFile(
          path.join(templateDirNoSubject, 'html.pug'),
          'h1 Hello #{name}\ndiv.content #{t("welcome")}',
        ),
      ]);
      const mail = new Mail(
        mockApp,
        'test-template-no-subject',
        { name: 'John' },
        { t: (str) => str, language: 'en' },
      );
      await assert.rejects(
        async () => {
          await mail.renderTemplate();
        },
        (err: Error) => {
          assert(
            err.message.includes('Template HTML and Subject must be provided'),
          );
          return true;
        },
      );
      await rm(templateDirNoSubject, { recursive: true, force: true });
    });

    it('should return error if html have no extension', async () => {
      const templateDirEmptyHTML = path.join(tempDir, 'test-template-wrong');
      await mkdir(templateDirEmptyHTML, { recursive: true });
      await Promise.all([
        writeFile(path.join(templateDirEmptyHTML, 'html'), 'this is empty'),
        writeFile(path.join(templateDirEmptyHTML, 'subject'), 'this is empty'),
      ]);
      const mail = new Mail(
        mockApp,
        'test-template-wrong',
        { name: 'John' },
        { t: (str) => str, language: 'en' },
      );
      await assert.rejects(
        async () => {
          await mail.renderTemplate();
        },
        (err: Error) => {
          assert(err.message.includes('HTML template cant be rendered'));
          return true;
        },
      );
      await rm(templateDirEmptyHTML, { recursive: true, force: true });
    });

    it('should return null if html on unknown type', async () => {
      const templateDirEmptyHTML = path.join(tempDir, 'test-template-wrong');
      await mkdir(templateDirEmptyHTML, { recursive: true });
      await Promise.all([
        writeFile(
          path.join(templateDirEmptyHTML, 'html.fakeExtension'),
          'this is empty',
        ),
        writeFile(
          path.join(templateDirEmptyHTML, 'subject.fakeExtension'),
          'this is empty',
        ),
      ]);
      const mail = new Mail(
        mockApp,
        'test-template-wrong',
        { name: 'John' },
        { t: (str) => str, language: 'en' },
      );
      await assert.rejects(
        async () => {
          await mail.renderTemplate();
        },
        (err: Error) => {
          assert(
            err.message.includes(
              'Template type fakeExtension is not supported',
            ),
          );
          return true;
        },
      );
      await rm(templateDirEmptyHTML, { recursive: true, force: true });
    });

    it('should generate text from html', async () => {
      const result = await Mail.sendRaw(
        mockApp,
        'to',
        'subject',
        'html <h1>Hello</h1>',
      );
      const message = result.response.toString();
      assert.ok(message.includes('html\n\n\nHELLO'));
    });
  });

  describe('Template inheritance (app, framework, module)', () => {
    let tempDirInh: string;
    let templateDirInhA: string;
    let templateDirInhF: string;
    let mockAppInh: TMinimalApp;
    before(async () => {
      tempDirInh = await mkdtemp(path.join(os.tmpdir(), 'mail-test-inh'));
      templateDirInhA = path.join(tempDir, 'a/emptyTemplate');
      templateDirInhF = path.join(
        tempDir,
        'f/services/messaging/email/templates/emptyTemplate',
      );

      // Create test template directory
      await mkdir(templateDirInhA, { recursive: true });
      await mkdir(templateDirInhF, { recursive: true });
      // Create test template files
      await Promise.all([
        writeFile(path.join(templateDirInhA, 'html.html'), 'app template'),
        writeFile(path.join(templateDirInhA, 'subject.html'), 'app subject'),
        writeFile(
          path.join(templateDirInhF, 'html.html'),
          'framework template',
        ),
        writeFile(
          path.join(templateDirInhF, 'subject.html'),
          'framework subject',
        ),
      ]);
      mockAppInh = {
        ...mockApp,
        ...{
          foldersConfig: { emails: path.join(tempDir, 'a') },
          frameworkFolder: path.join(tempDir, 'f'),
        },
      };
    });

    after(async () => {
      if (tempDirInh) {
        await rm(tempDirInh, { recursive: true, force: true });
      }
    });

    it('should render template from app in a first priority', async () => {
      const mail = new Mail(mockAppInh, 'emptyTemplate');
      const rendered = await mail.renderTemplate();
      assert.equal(rendered.htmlRaw, 'app template');
    });

    it('should render template from framework in a second priority', async () => {
      await rm(path.join(tempDir, 'a'), { recursive: true, force: true });
      const mail = new Mail(mockAppInh, 'emptyTemplate');
      const rendered = await mail.renderTemplate();
      assert.equal(rendered.htmlRaw, 'framework template');
    });

    it('should render template from module in a third priority', async () => {
      await rm(path.join(tempDir, 'f'), { recursive: true, force: true });
      const mail = new Mail(mockAppInh, 'emptyTemplate');
      const rendered = await mail.renderTemplate();
      assert(rendered.htmlRaw.includes('message template not found'));
    });
  });

  describe('Template engines', () => {
    it('ships plain-text engines and the opted-in pug engine', () => {
      assert.equal(Mail.hasTemplateEngine('html'), true);
      assert.equal(Mail.hasTemplateEngine('text'), true);
      assert.equal(Mail.hasTemplateEngine('css'), true);
      // registered by this suite's setup, not by the module itself
      assert.equal(Mail.hasTemplateEngine('pug'), true);
    });

    it('registers, uses and unregisters a custom engine', async () => {
      Mail.registerTemplateEngine('mustache', async (fullPath, data) => {
        const raw = await readFile(fullPath, 'utf8');
        return raw.replace(/\{\{(\w+)\}\}/g, (_, key) =>
          String(data[key] ?? ''),
        );
      });
      assert.equal(Mail.hasTemplateEngine('mustache'), true);

      const dir = path.join(tempDir, 'custom-engine');
      await mkdir(dir, { recursive: true });
      await Promise.all([
        writeFile(path.join(dir, 'html.mustache'), '<h1>Hi {{name}}</h1>'),
        writeFile(path.join(dir, 'subject.html'), 'Hello'),
      ]);

      const mail = new Mail(mockApp, 'custom-engine', { name: 'Jane' });
      const rendered = await mail.renderTemplate();
      assert.ok(rendered.inlinedHTML.includes('Hi Jane'));
      assert.equal(rendered.subject, 'Hello');

      assert.equal(Mail.unregisterTemplateEngine('mustache'), true);
      assert.equal(Mail.hasTemplateEngine('mustache'), false);

      await rm(dir, { recursive: true, force: true });
    });

    it('normalizes the extension (leading dot and case)', () => {
      Mail.registerTemplateEngine('.FOO', () => '');
      assert.equal(Mail.hasTemplateEngine('foo'), true);
      assert.equal(Mail.hasTemplateEngine('.Foo'), true);
      assert.equal(Mail.unregisterTemplateEngine('foo'), true);
    });

    it('throws when registering without an engine function', () => {
      assert.throws(
        // @ts-expect-error testing invalid usage
        () => Mail.registerTemplateEngine('bad'),
        /requires a non-empty extension and an engine function/,
      );
    });
  });

  describe('Email sending', () => {
    it('should throw error when required fields are missing', async () => {
      await assert.rejects(
        async () => {
          await Mail.sendRaw(mockApp, '', 'subject', 'html');
        },
        {
          name: 'Error',
          message: 'App, to, subject and html is required fields.',
        },
      );
    });

    it('should send email with correct parameters', async () => {
      const mail = new Mail(
        mockApp,
        'test-template',
        { name: 'John' },
        { t: (str) => str, language: 'en' },
      );

      const result = await mail.send('recipient@test.com');
      assert.ok(result);
    });

    it('should use default from address when not provided', async () => {
      const mail = new Mail(mockApp, 'test-template');
      const result = await mail.send('recipient@test.com');
      assert.equal(result.envelope.from, 'test@test.com');
    });

    it('should respect additional nodemailer options', async () => {
      const mail = new Mail(mockApp, 'test-template');
      const additionalOptions = {
        cc: 'cc@test.com',
        bcc: 'bcc@test.com',
        attachments: [
          {
            filename: 'test.txt',
            content: 'Hello World',
          },
        ],
      };

      const result = await mail.send(
        'recipient@test.com',
        '',
        additionalOptions,
      );

      const message = result.response.toString();

      assert.ok(result.envelope.to.includes('cc@test.com'));
      assert.ok(result.envelope.to.includes('bcc@test.com'));
      assert.ok(
        message.includes('Content-Disposition: attachment; filename=test.txt'),
      );
      assert.ok(
        message.includes(Buffer.from('Hello World').toString('base64')),
      );
    });
  });

  // Kept last on purpose: the two final tests override and then remove the
  // built-in `js` engine, and the engine registry is process-wide, so nothing
  // that relies on the built-ins may run after them.
  describe('Built-in module template engines', () => {
    let moduleTempDir: string;
    let moduleApp: TMinimalApp;

    /**
     * Write a template folder for the module engines.
     *
     * Module system matters here: a bare `.js` file inside an OS temp folder
     * has no `package.json` above it, so Node loads it as CommonJS and
     * `export default` would be a syntax error. Every fixture folder therefore
     * gets its own `package.json` pinning the module system ('module' by
     * default); `.mjs`/`.cjs` fixtures are explicit regardless of it.
     * The extra `package.json` is inert for the renderer, which only looks at
     * the `html`, `subject`, `text` and `style` basenames.
     */
    const writeTemplateDir = async (
      name: string,
      files: Record<string, string>,
      packageType: 'module' | 'commonjs' = 'module',
    ) => {
      const dir = path.join(moduleTempDir, name);
      await mkdir(dir, { recursive: true });
      await Promise.all([
        writeFile(
          path.join(dir, 'package.json'),
          JSON.stringify({ type: packageType }),
        ),
        ...Object.entries(files).map(([file, content]) =>
          writeFile(path.join(dir, file), content),
        ),
      ]);
      return dir;
    };

    before(async () => {
      moduleTempDir = await mkdtemp(
        path.join(os.tmpdir(), 'mail-test-module-'),
      );
      moduleApp = {
        ...mockApp,
        foldersConfig: { emails: moduleTempDir },
      };
    });

    after(async () => {
      if (moduleTempDir) {
        await rm(moduleTempDir, { recursive: true, force: true });
      }
    });

    it('ships built-in engines for js, ts, mjs and cjs', () => {
      assert.equal(Mail.hasTemplateEngine('js'), true);
      assert.equal(Mail.hasTemplateEngine('ts'), true);
      assert.equal(Mail.hasTemplateEngine('mjs'), true);
      assert.equal(Mail.hasTemplateEngine('cjs'), true);
    });

    it('renders an ESM js template module', async () => {
      await writeTemplateDir('esm-js', {
        'html.js': `export default (data) => \`<h1>Hello \${data.name}</h1>\`;\n`,
        'subject.js': `export default () => 'Welcome aboard';\n`,
        'text.js': `export default (data) => \`Hello \${data.name}\`;\n`,
      });

      const mail = new Mail(moduleApp, 'esm-js', { name: 'John' });
      const rendered = await mail.renderTemplate();

      assert.ok(rendered.inlinedHTML.includes('Hello John'));
      assert.equal(rendered.subject, 'Welcome aboard');
      assert.equal(rendered.text, 'Hello John');
    });

    it('renders a CommonJS template module through the same engine', async () => {
      await writeTemplateDir('cjs-template', {
        'html.cjs': `module.exports = (data) => \`<h1>Hi \${data.name}</h1>\`;\n`,
        'subject.cjs': `module.exports = () => 'From CJS';\n`,
      });

      const mail = new Mail(moduleApp, 'cjs-template', { name: 'Jane' });
      const rendered = await mail.renderTemplate();

      assert.ok(rendered.inlinedHTML.includes('Hi Jane'));
      assert.equal(rendered.subject, 'From CJS');
    });

    it('awaits an async default export (mjs)', async () => {
      await writeTemplateDir('async-mjs', {
        'html.mjs':
          `export default async (data) => {\n` +
          `  await new Promise((resolve) => setTimeout(resolve, 1));\n` +
          `  return \`<h1>Async \${data.name}</h1>\`;\n` +
          `};\n`,
        'subject.mjs': `export default async () => Promise.resolve('Async subject');\n`,
      });

      const mail = new Mail(moduleApp, 'async-mjs', { name: 'Ann' });
      const rendered = await mail.renderTemplate();

      assert.ok(rendered.inlinedHTML.includes('Async Ann'));
      assert.equal(rendered.subject, 'Async subject');
    });

    it('renders a ts template module and receives the full render data', async () => {
      await writeTemplateDir('ts-template', {
        'html.ts':
          `const template = (data: Record<string, unknown>) =>\n` +
          `  \`<p>\${data.name}|\${data.locale}|\${typeof data.t}</p>\`;\n` +
          `export default template;\n`,
        'subject.ts':
          `const subject = (data: Record<string, unknown>) =>\n` +
          `  \`Subject for \${data.name}\`;\n` +
          `export default subject;\n`,
      });

      const mail = new Mail(
        moduleApp,
        'ts-template',
        { name: 'Ted' },
        { t: (str) => str, language: 'fr' },
      );
      const rendered = await mail.renderTemplate();

      assert.ok(rendered.inlinedHTML.includes('Ted|fr|function'));
      assert.equal(rendered.subject, 'Subject for Ted');
    });

    it('uses the fallback t (defaultValue aware) when no i18n was provided', async () => {
      await writeTemplateDir('fallback-t', {
        'html.js':
          `export default (data) =>\n` +
          `  \`<h1>\${data.t('email.greeting', { defaultValue: 'Hello there' })}</h1>\` +\n` +
          `  \`<p>\${data.t('email.bye', 'See you soon')}</p>\` +\n` +
          `  \`<span>\${data.t('email.untranslated')}</span>\`;\n`,
        'subject.js':
          `export default (data) =>\n` +
          `  data.t('email.subject', { defaultValue: 'Default subject' });\n`,
      });

      const mail = new Mail(moduleApp, 'fallback-t');
      const rendered = await mail.renderTemplate();

      assert.ok(rendered.htmlRaw.includes('Hello there'));
      assert.ok(rendered.htmlRaw.includes('See you soon'));
      assert.ok(rendered.htmlRaw.includes('email.untranslated'));
      assert.equal(rendered.subject, 'Default subject');
    });

    it('throws a clear error when the default export is not a function', async () => {
      const dir = await writeTemplateDir('bad-default-export', {
        'html.js': `export const render = () => '<h1>nope</h1>';\n`,
        'subject.js': `export default () => 'subject';\n`,
      });

      const mail = new Mail(moduleApp, 'bad-default-export');
      await assert.rejects(
        async () => {
          await mail.renderTemplate();
        },
        (err: Error) => {
          assert.ok(err.message.includes(path.join(dir, 'html.js')));
          assert.ok(
            err.message.includes(
              'default export must be a function (data) => string | Promise<string>',
            ),
          );
          return true;
        },
      );
    });

    it('lets an app-registered js engine override the built-in one', async () => {
      await writeTemplateDir('override-js', {
        'html.js': `export default () => '<h1>built-in</h1>';\n`,
        'subject.js': `export default () => 'built-in subject';\n`,
      });

      Mail.registerTemplateEngine(
        'js',
        (fullPath) => `<h1>custom engine: ${path.basename(fullPath)}</h1>`,
      );

      const mail = new Mail(moduleApp, 'override-js');
      const rendered = await mail.renderTemplate();

      assert.ok(rendered.htmlRaw.includes('custom engine: html.js'));
      assert.equal(rendered.subject, '<h1>custom engine: subject.js</h1>');
    });

    it('lets a built-in engine be unregistered', async () => {
      assert.equal(Mail.unregisterTemplateEngine('js'), true);
      assert.equal(Mail.hasTemplateEngine('js'), false);

      const mail = new Mail(moduleApp, 'override-js');
      await assert.rejects(
        async () => {
          await mail.renderTemplate();
        },
        (err: Error) => {
          assert.ok(err.message.includes('Template type js is not supported'));
          return true;
        },
      );
    });
  });
});
