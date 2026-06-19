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
