import type { Options as SMTPTransportOptions } from 'nodemailer/lib/smtp-transport/index.d.ts';
import type stubTransport from 'nodemailer-stub-transport';

export type TMinimalI18n = {
  t: (key: string, options?: Record<string, unknown>) => string;
  language: string;
};

/**
 * Template engine. Receives the absolute path to a template file and the data
 * to render, and returns the rendered string (sync or async).
 * Register custom engines via `Mail.registerTemplateEngine(extension, engine)`.
 */
export type TTemplateEngine = (
  fullPath: string,
  templateData: Record<string, unknown>,
) => string | Promise<string>;

export interface EmailConfig {
  from?: string;
  transports?: {
    stub?: Parameters<typeof stubTransport>[0];
    smtp?: SMTPTransportOptions;
  };
  transport?: 'stub' | 'smtp';
  webResources?: {
    relativeTo?: string;
    images?: boolean;
    links?: boolean;
    scripts?: boolean;
  };
  globalVariablesToTemplates?: Record<string, unknown>;
}

export type TMinimalApp = {
  foldersConfig: {
    emails?: string;
  };
  logger: {
    error: (message: string) => void;
  };
  getConfig(configName: 'mail'): EmailConfig;
  frameworkFolder: string;
};
