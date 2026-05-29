## VibeSwitch analyst workspace (`analyst.vibeswitch.ai`)

Separate SPA for calibration reviewers — isolated from the operator app at `vibeswitch.ai`, same pattern as [docs.vibeswitch.ai](https://docs.vibeswitch.ai/).

### Architecture (Option A — API proxy)

- **Static host:** Cloudflare Pages serves `analyst-site/dist`.
- **API:** Pages Function [`functions/api/[[path]].js`](./functions/api/[[path]].js) forwards `/api/*` to the main backend (`API_ORIGIN`, default `https://vibeswitch.ai`).
- **Auth:** Same Firebase project; add `analyst.vibeswitch.ai` to Firebase **Authorized domains**.
- **Access:** Server allowlist `RESILIENCE_ANALYST_EMAILS`; UI gates on `GET /api/resilience/display-capabilities`.

The operator client under `client/` is **not** modified.

### Shared UI

Vite aliases `@client` → `../client/src` so drift, pipeline, and analyst report views reuse existing components and hooks.

### Local development

Terminal 1 — API:

```bash
npm start
```

Terminal 2 — analyst workspace (port 5174, proxies `/api` → `:3000`):

```bash
cd analyst-site
cp env.example .env.local   # fill VITE_FIREBASE_* from Firebase Console
npm install
npm run dev
```

### Production build

```bash
npm run analyst:build
# output: analyst-site/dist
```

### Cloudflare Pages

| Setting | Value |
|---------|--------|
| **Build command** | `cd analyst-site && npm ci && npm run build` |
| **Output directory** | `analyst-site/dist` |
| **Root directory** | `analyst-site` |
| **Node.js** | 20+ |
| **Environment** | `API_ORIGIN=https://vibeswitch.ai` |
| **Build env** | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` (+ optional `VITE_FIREBASE_APP_ID`) |

Custom domain: `analyst.vibeswitch.ai`.

`public/_routes.json` keeps `/api/*` on the proxy function; `public/_redirects` SPA-falls back all other paths to `index.html`.

### Security notes

- UI hiding is not enough; analyst endpoints remain gated by `requireAnalystView()` on the API server.
- Do not link this URL from the operator app unless you want discoverability.
- `robots: noindex` is set in `index.html`.
