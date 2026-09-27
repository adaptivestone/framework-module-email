# adaptivestone-framework-module-email

[![npm package](https://img.shields.io/npm/v/@adaptivestone/framework-module-email)](https://www.npmjs.com/package/@adaptivestone/framework-module-email)

> Adaptive stone framework module email

ESM only module.

Email subsystem based on [nodemailer](https://github.com/nodemailer/nodemailer). In additional we are using [juice](https://www.npmjs.com/package/juice) to inline css and [html-to-text](https://www.npmjs.com/package/html-to-text) to generate text from html of files

## Install

```bash
npm install @adaptivestone/framework-module-email
```

## Usage

```ts
import Mail from '@adaptivestone/framework-module-email';
```

## Template engines

A template is a folder of files whose extension selects the engine used to render it. Out of the box the module ships two kinds of built-in engine and has **no template-engine dependency of its own**:

| Extensions | Engine |
| --- | --- |
| `html`, `text`, `css` | plain files, read as-is |
| `js`, `ts`, `mjs`, `cjs` | module templates — the file is imported and its **default export is called with the render data** |

### Module templates

A module template is an ordinary module whose default export turns the render data into a string:

```ts
// emails/welcome/html.ts
type WelcomeData = {
  t: (key: string, options?: { defaultValue?: string }) => string;
  name: string;
};

export default ({ t, name }: WelcomeData) => `
  <h1>${t('email.welcome.title', { defaultValue: 'Welcome!' })}</h1>
  <p>Hello ${name}</p>
`;
```

Declare the data shape your template expects, as above — the engine itself calls the default export untyped (`TTemplateModule` from `@adaptivestone/framework-module-email/dist/types.d.ts` describes that raw contract, whose `data` is `Record<string, unknown>`, so calling `data.t(...)` on it directly does not type-check).

`html`, `subject` and `text` can be modules; keep `style` as a plain `.css` file — it is rendered without any data.

- The default export may be sync or async: `(data) => string | Promise<string>`.
- It receives the same data every engine gets — `locale`, `t`, the mail config's `globalVariablesToTemplates`, and whatever you passed as `templateData`.
- `t` comes from the i18n object handed to `new Mail(...)`. Without one a fallback translator is used that honours the i18next default overloads: `t('email.hi', { defaultValue: 'Hi' })` and `t('email.hi', 'Hi')` both return `Hi`, while a key with no default renders as the key itself.
- A file whose default export is missing or is not a function fails with a clear error naming that file.
- `js`, `ts`, `mjs` and `cjs` share one engine — ship whichever extension your app produces (`.ts` when you run TypeScript natively, `.js` after a build step).
- Templates are imported once per process and cached by `import()`. That is what you want for template files shipped with an app, but a template edited on disk needs a restart to be picked up.

### Bring your own engine

To render templates written in a real templating language, install that engine in your app and register it. The callback receives the absolute path to the template file and the render data, and returns the rendered string (sync or async):

```ts
import pug from 'pug';
import ejs from 'ejs';
import Mail from '@adaptivestone/framework-module-email';

// Pug — was bundled by default before v2; now opt-in
Mail.registerTemplateEngine('pug', (fullPath, data) =>
  pug.compileFile(fullPath)(data),
);

// any engine works the same way
Mail.registerTemplateEngine('ejs', (fullPath, data) => ejs.renderFile(fullPath, data));
```

### Where to register

Engines live in a **single process-wide registry** shared by every `Mail` instance, so you register them **once at process startup, before any email is sent** — not per request and not per `Mail` instance.

In an `@adaptivestone/framework` app the natural place is the worker bootstrap (`src/server.ts`), the file each worker process runs. Register before `startServer()`:

```ts
// src/server.ts
import Server from '@adaptivestone/framework/server.js';
import Mail from '@adaptivestone/framework-module-email';
import pug from 'pug';
import folderConfig from './folderConfig.ts';

Mail.registerTemplateEngine('pug', (fullPath, data) =>
  pug.compileFile(fullPath)(data),
);

const server = new Server(folderConfig);
await server.startServer();
```

> The registry is per **process**. If your app uses the cluster manager (`src/index.ts` forking workers), register in `src/server.ts` (which every worker runs), not in the master `src/index.ts` (which never sends mail).

### Registering more than once

`registerTemplateEngine` can be called as many times as you like:

- **Different extensions accumulate** — call it once per engine you want (`pug`, `ejs`, `mjml`, …).
- **The same extension overrides** — the last registration for a given extension wins. The built-ins are ordinary entries with no special casing, so you can replace one (swap the `html` reader, or give `js` your own invocation contract such as named exports or a precompiled cache) or re-register safely. There is no error on re-registration, and `unregisterTemplateEngine` removes a built-in just as well.
- Extensions are normalized, so `'pug'`, `'.pug'` and `'.PUG'` all target the same engine.

### Helpers

- `Mail.registerTemplateEngine(extension, engine)` — register/override an engine for a file extension (leading dot optional, case-insensitive).
- `Mail.unregisterTemplateEngine(extension)` — remove an engine; returns `true` if one was removed.
- `Mail.hasTemplateEngine(extension)` — check whether an engine is registered.

### Inline images

Configure CID attachments once in your application's `mail` config. The module
adds an attachment only when the rendered HTML references its CID, and preserves
attachments passed to `send()` or `sendRaw()` for that message.

```ts
import path from 'node:path';

export default {
  inlineAttachments: [
    {
      filename: 'brand.png',
      path: path.resolve('src/services/messaging/email/resources/brand.png'),
      cid: 'brand@example.com',
    },
  ],
};
```

Reference the same ID in a template: `<img src="cid:brand@example.com" alt="Brand">`.
Nodemailer embeds the image in the message, so it does not require a remote
image request.

## API

Please check detailed documentation [here](https://framework.adaptivestone.com/docs/email)
