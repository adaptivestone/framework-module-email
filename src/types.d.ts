import type { Options as SMTPTransportOptions } from 'nodemailer/lib/smtp-transport/index.d.ts';
import type stubTransport from 'nodemailer-stub-transport';

/**
 * Options object of a `t()` call. `defaultValue` is the only option the
 * fallback translator (used when no i18n object is given) understands; the
 * index signature keeps every other i18next option — interpolation values,
 * `count`, `ns`, ... — assignable.
 */
export type TMinimalI18nOptions = {
  defaultValue?: string;
  [key: string]: unknown;
};

export type TMinimalI18n = {
  /**
   * Translate a key, e.g. `t('email.hi', { defaultValue: 'Hello' })`.
   *
   * The positional i18next default overload — `t('email.hi', 'Hello')` — is
   * honoured at runtime as well, but is deliberately not declared here: adding
   * a `string` second parameter makes i18next's own `TFunction` stop being
   * assignable to `TMinimalI18n` (see the assignability proof below).
   */
  t: (key: string, options?: TMinimalI18nOptions) => string;
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

/**
 * Contract of a template written as a module (`.js`, `.ts`, `.mjs`, `.cjs`):
 * a default export that turns the render data into the rendered string.
 *
 * @example
 * // html.ts
 * import type { TTemplateModule } from '@adaptivestone/framework-module-email/dist/types.d.ts';
 * const template: TTemplateModule = (data) => `<h1>Hello ${data.name}</h1>`;
 * export default template;
 */
export type TTemplateModule = (
  templateData: Record<string, unknown>,
) => string | Promise<string>;

/* -------------------------------------------------------------------------- */
/* Compile-time proof that the `t` shapes callers really pass stay assignable  */
/* to `TMinimalI18n`. Types only — nothing is exported and nothing is emitted. */
/* -------------------------------------------------------------------------- */

/** Fails to compile as soon as `Actual` stops being assignable to `Expected`. */
type TAssertAssignable<Expected, Actual extends Expected> = Actual;

/**
 * i18next's `TFunction`, reduced to the call shapes it accepts. The framework
 * hands over `{ t, language }` built from `req.appInfo.i18n`, where `t` is that
 * `TFunction`, so this must stay assignable.
 */
type TI18nextLikeTFunction = (
  ...args:
    | [key: string, options?: Record<string, unknown>]
    | [key: string, defaultValue: string, options?: Record<string, unknown>]
) => string;

type _AssertI18nextIsMinimalI18n = TAssertAssignable<
  TMinimalI18n,
  { t: TI18nextLikeTFunction; language: string }
>;

/** A translator typed against the 2.0 `TMinimalI18n` keeps working. */
type _AssertV2I18nIsMinimalI18n = TAssertAssignable<
  TMinimalI18n,
  {
    t: (key: string, options?: Record<string, unknown>) => string;
    language: string;
  }
>;

/** A hand-rolled one-argument translator stays valid too. */
type _AssertSimpleI18nIsMinimalI18n = TAssertAssignable<
  TMinimalI18n,
  { t: (key: string) => string; language: string }
>;

/** Template authors can hand `t` a default value. */
type _AssertDefaultValueIsAccepted = TAssertAssignable<
  TMinimalI18nOptions,
  { defaultValue: string; count: number }
>;

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
