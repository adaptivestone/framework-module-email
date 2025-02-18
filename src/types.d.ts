import type { Options as SMTPTransportOptions } from "nodemailer/lib/smtp-transport/index.d.ts";
import type stubTransport from "nodemailer-stub-transport";

export type TMinimalI18n = {
  t: (key: string, options?: any) => string;
  language: string;
};

export interface EmailConfig {
  from: string;
  transports: {
    stub: Parameters<typeof stubTransport>[0];
    smtp: SMTPTransportOptions;
  };
  transport: "stub" | "smtp";
  webResources: {
    relativeTo: string;
    images: boolean;
  };
  globalVariablesToTemplates: Record<string, unknown>;
}

export type TMinimalApp = {
  foldersConfig: {
    emails: string;
  };
  logger: {
    error: (message: string) => void;
  };
  getConfig(configName: "mail"): EmailConfig;
};
