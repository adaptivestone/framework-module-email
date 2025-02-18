import type { EmailConfig } from '../types.d.ts';

import path from 'node:path';

const config: EmailConfig = {
  from: 'Localhost <info@localhost>',
  transports: {
    stub: {},
    smtp: {
      // https://github.com/nodemailer/nodemailer#set-up-smtp
      host: process.env.EMAIL_HOST || 'smtp.mailtrap.io',
      port: parseInt(process.env.EMAIL_PORT) || 2525,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      connectionTimeout: 10000, // timeout to 10 seconds
    },
  },
  transport: (process.env.EMAIL_TRANSPORT as 'stub' | 'smtp') || 'smtp',
  webResources: {
    // https://github.com/jrit/web-resource-inliner path to find resources
    relativeTo: path.resolve('src/services/messaging/email/resources'),
    images: false,
  },
  globalVariablesToTemplates: {},
};

export default config;
