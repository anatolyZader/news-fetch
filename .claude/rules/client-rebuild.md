---
description: Rebuild the Vite client after frontend edits (server serves client/dist)
paths:
  - "client/**"
  - "server.js"
  - "app.js"
  - "product_docs/**"
---

<!-- Ported from .cursor/rules/client-rebuild.mdc — edit both together. Globs widened: the server-restart half of this rule fires on server.js/app.js/product_docs edits too. -->

# Client rebuild after changes

This app serves the SPA from **`client/dist`** (`npm start` → Fastify static). Edits under `client/src/` do **not** appear in the browser until the client is rebuilt.

## Agent workflow (required)

After changing any file under `client/`:

1. Run **`npm run client:build`** before marking the task done.
2. If the build fails, fix errors and rebuild.
3. **Restart the running app** so `client/dist` is served fresh:
   - Prefer **`pm2 restart news`** when PM2 manages the process (typical on this host).
   - Otherwise restart **`npm start`** / `node server.js` if it is already running.
4. Do not ask the user to rebuild or restart manually unless the build environment is unavailable.

After changing **`server.js`**, **`app.js`**, routes, or **`product_docs/`** (served by the API):

1. **`pm2 restart news`** (or restart the Node server the same way as above).
2. Client rebuild is not required unless `client/` also changed.

## Local dev (optional, for the user)

- **`npm run client:dev`** — Vite dev server with HMR (proxies `/api` to `:3000`). Best for active UI work.
- **`npm run client:watch`** — Rebuilds `client/dist` on every save while `npm start` is running.
