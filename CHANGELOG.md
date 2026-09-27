# 2.1.1

**Features**

- Configurable `inlineAttachments` for CID images. A configured attachment is
  included only when the rendered HTML references its CID, and per-message
  attachments remain intact.

# 2.1.0

**Features**

- Built-in template engines for module templates: `js`, `ts`, `mjs` and `cjs`. The file is imported and its default export is called with the render data, honouring `string | Promise<string>` returns:
  ```ts
  // emails/welcome/html.ts
  export default (data) => `<h1>Hello ${data.name}</h1>`;
  ```
  A missing or non-function default export fails with a clear error naming the file.
- The built-ins are plain entries in the engine registry, so `Mail.registerTemplateEngine('js', ...)` overrides one and `Mail.unregisterTemplateEngine('js')` removes it, exactly as for a custom engine.
- Exported the `TTemplateModule` type describing the module template contract.

**Fixes**

- The fallback i18n used when no i18n object is passed to `new Mail(...)` now honours both i18next default overloads — `t('key', 'Default')` and `t('key', { defaultValue: 'Default' })` return the default instead of the raw key. A key with no default still renders as the key.
- `TMinimalI18n` now documents the `t` options object (`TMinimalI18nOptions` with `defaultValue`), so templates can type-check `t(key, { defaultValue: '...' })`.

# 2.0.0

**Breaking changes**

- Pug is no longer a dependency of this module and is not bundled. Out of the box only the plain `html`, `text` and `css` template engines are available.
- To keep rendering `.pug` templates, install pug in your app and register it once at startup:
  ```ts
  import pug from 'pug';
  import Mail from '@adaptivestone/framework-module-email';

  Mail.registerTemplateEngine('pug', (fullPath, data) =>
    pug.compileFile(fullPath)(data),
  );
  ```
- The built-in `emptyTemplate` fallback is now plain HTML/text instead of Pug.

**Features**

- New `Mail.registerTemplateEngine(extension, engine)` to register custom template engines for any file extension (pug, ejs, handlebars, mustache, ...). Engines receive the absolute template path and the render data, and return a string (sync or async).
- New `Mail.unregisterTemplateEngine(extension)` and `Mail.hasTemplateEngine(extension)` helpers.
- Exported the `TTemplateEngine` type.

# 1.1.3

- Update nodemailer from v8 to v9
- Update dependencies

# 1.1.2

- Update juice from v11 to v12
- Require Node.js >=22.12.0 (juice v12 minimum)
- Disable remote `<link>`/`<script>` fetching during CSS inlining (SSRF hardening)
- Resolve template file extensions via `path.parse` to support multi-dot filenames
- Update dependencies

# 1.1.1
Update dependencies

# 1.1.0

- Update TypeScript from v5 to v6
- Update nodemailer from v7 to v8
- Replace Prettier with Biome for formatting and linting
- Update dependencies

# 1.0.4

Update dependencies

# 1.0.3

Update dependencies

# 1.0.2

Update dependencies

# 1.0.1

Update types

# 0.0.1

Initial release. Migration from the framework module email
