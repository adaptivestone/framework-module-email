import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Mail from '../src/index.ts';

describe('Mail module', () => {
  const mockApp = {
    foldersConfig: {
      emails: 'test/emails',
    },
    logger: {
      error: (msg) => {
        console.log(msg);
      },
    },
    getConfig(configName: 'mail') {
      return {
        from: 'test@test.com',
      };
    },
  };

  it('config file should be loaded', () => {
    const mail = new Mail(mockApp, 'test');
    const finalConfig = Mail.getConfig(mail.app);
    assert.equal(finalConfig.from, 'test@test.com');
    assert.equal(finalConfig.transport, 'smtp');
  });

  describe('Configuration', () => {
    it('should load config file correctly', () => {
      const mail = new Mail(mockApp, 'test');
      const finalConfig = Mail.getConfig(mail.app);
      assert.equal(finalConfig.from, 'test@test.com');
      assert.equal(finalConfig.transport, 'smtp');
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
});
