# Screenshot manifest — HQ brochure

> Required captures for [`../print/brochure-hq-en.html`](../print/brochure-hq-en.html). Follow [`../copy/demo-script.md`](../copy/demo-script.md). Operator view only — not analyst.

## Pre-flight

- [ ] Good assessment day loaded (not empty state)
- [ ] Assessment date visible in footer
- [ ] Browser 1440×900 or 1920×1080, 100% zoom
- [ ] Operator / narrative view (not analyst scoring view)
- [ ] Blur or crop any sensitive content if needed

## Files (drop into this folder)

| File | Screen | Brochure use |
|------|--------|--------------|
| `01-home-8components.png` | Home — daily assessment, eight components | Cover hero |
| `02-component-narrative.png` | One hot component — narrative + inline citations | Page 3 proof |
| `03-evidence-pool.png` | Evidence pool / raw excerpts under a component | Page 3 proof |
| `04-chat-cited.png` | Chat with a cited answer visible | Page 3 proof |
| `05-data-sources.png` | Data sources bar or source browse view | Page 2 or 3 |
| `06-field-submission.png` | Submissions tab or report-bot inbox | Page 4 field loop |

## Capture hints

1. **01** — Full home with component list; ensure date in footer.
2. **02** — Expand the most active component; one narrative sentence + `[source]` visible.
3. **03** — Scroll to evidence pool; show verbatim excerpts label if present.
4. **04** — Ask: “What should I verify in the field today?” — capture answer with citation.
5. **05** — Open data-sources picker or a source tab header.
6. **06** — Submissions or Report bot tab with upload/send UI visible.

## Authentication (production)

**https://srulik.ai requires Firebase sign-in.** An anonymous Playwright visit only sees the login screen — that is expected, not a Playwright bug.

### Option A — email/password (headless)

Use your **real** invite-authorized operator account (not the doc placeholders `your@email.com` / `your-password`).

```bash
PROMO_AUTH_EMAIL='real.account@domain.com' PROMO_AUTH_PASSWORD='…' \
  PROMO_BASE_URL=https://srulik.ai node promo/screenshots/capture-brochure-shots.mjs
```

### Option A2 — manual sign-in (headed browser, Google OK)

On a machine with a display (or SSH X11 forwarding):

```bash
PROMO_HEADED=1 PROMO_BASE_URL=https://srulik.ai node promo/screenshots/capture-brochure-shots.mjs
```

Sign in in the window; session saves to `.auth-state.json`. Later runs can be headless with that file.

### Option B — reuse saved session

```bash
PROMO_STORAGE_STATE=promo/screenshots/.auth-state.json \
  PROMO_BASE_URL=https://srulik.ai node promo/screenshots/capture-brochure-shots.mjs
```

### Option C — local app without auth

```bash
# AUTH_REQUIRED unset/false on local server
node promo/screenshots/capture-brochure-shots.mjs
```

Google popup sign-in does not work headless — use email/password or manual screenshots.

## Capture (automated)

From repo root. On Linux, install Chromium system libraries once ( **`sudo` does not see `npx` from nvm** — pass PATH):

```bash
sudo env PATH="$HOME/.nvm/versions/node/$(node -v | tr -d v)/bin:$PATH" npx playwright install-deps chromium
# or, from repo root with explicit nvm path:
sudo env PATH="/home/eventstorm1/.nvm/versions/node/v24.12.0/bin:$PATH" npx playwright install-deps chromium

PROMO_BASE_URL=https://srulik.ai node promo/screenshots/capture-brochure-shots.mjs
```

Default base URL is `http://127.0.0.1:3000` if the app runs locally.

## Capture (manual)

Use browser devtools or OS screenshot at 1440×900 while following [`../copy/demo-script.md`](../copy/demo-script.md).
