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

A template is a folder of files whose extension selects the engine used to render it. Out of the box the module ships only plain-text engines — `html`, `text` and `css` (files are read as-is) — and has **no template-engine dependency of its own**.

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
- **The same extension overrides** — the last registration for a given extension wins, so you can replace a built-in (e.g. swap the default `html` reader) or re-register safely. There is no error on re-registration.
- Extensions are normalized, so `'pug'`, `'.pug'` and `'.PUG'` all target the same engine.

### Helpers

- `Mail.registerTemplateEngine(extension, engine)` — register/override an engine for a file extension (leading dot optional, case-insensitive).
- `Mail.unregisterTemplateEngine(extension)` — remove an engine; returns `true` if one was removed.
- `Mail.hasTemplateEngine(extension)` — check whether an engine is registered.

## API

Please check detailed documentation [here](https://framework.adaptivestone.com/docs/email)
