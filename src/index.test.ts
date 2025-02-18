import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Mail from '../src/index.ts';

describe('Mail module', () => {
  let mockApp;
  let tempDir;
  let templateDir;

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
