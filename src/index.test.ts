import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Mail from '../src/index.ts';

describe('Mail module', () => {
  it('config file should be loaded', () => {
    const mail = new Mail(
      {
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
      },
      'test',
    );
    const finalConfig = Mail.getConfig(mail.app);
    assert.equal(finalConfig.from, 'test@test.com');
    assert.equal(finalConfig.transport, 'smtp');
  });
});
