import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Mail from '../src/index.ts';
import type { TMinimalApp } from './types.d.ts';

describe('Mail module', () => {
  let mockApp: TMinimalApp;
  let tempDir: string;
  let templateDir: string;

  // Set up files once for all tests
  before(async () => {
    // Create temporary directory
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'mail-test-'));
    templateDir = path.join(tempDir, 'test-template');

    // Create test template directory
    await mkdir(templateDir, { recursive: true });

    // Create test template files
    await Promise.all([
      writeFile(
        path.join(templateDir, 'html.pug'),
        'h1 Hello #{name}\ndiv.content #{t("welcome")}',
      ),
      writeFile(path.join(templateDir, 'subject.pug'), '| Welcome #{name}'),
      writeFile(path.join(templateDir, 'style.css'), 'h1 { color: blue; }'),
      writeFile(
        path.join(templateDir, 'text.pug'),
        '| Hello #{name}, Welcome to our service!',
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
      getConfig(configName: 'mail') {
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
});
