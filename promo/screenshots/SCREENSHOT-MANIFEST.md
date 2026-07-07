# Screenshot manifest — HQ brochure

> Required captures for [`../print/brochure-hq-en.html`](../print/brochure-hq-en.html). Follow [`../copy/demo-script.md`](../copy/demo-script.md). Operator view only — not analyst.

**Naming:** manual captures use underscore filenames below. The Playwright script [`capture-brochure-shots.mjs`](capture-brochure-shots.mjs) still outputs legacy hyphen names — re-capture manually or rename if using automation until a follow-up unifies them.

## Pre-flight

- [ ] Good assessment day loaded (not empty state)
- [ ] Assessment date visible in footer
- [ ] Browser 1440×900 or 1920×1080, 100% zoom
- [ ] Operator / narrative view (not analyst scoring view)
- [ ] Blur or crop any sensitive content if needed

## Files (drop into this folder)

| File | Screen | Brochure use |
|------|--------|--------------|
| `01-home_screen.png` | Home — daily assessment, eight components | Page 1 cover hero |
| `02_component_narrative.png` | One hot component — narrative + inline citations | Page 3 proof row A |
| `03_evidence_visits.png` | Evidence pool — field visits | Page 3 evidence strip |
| `04_evidence_pbo.png` | Evidence pool — regional PBO | Page 3 evidence strip |
| `05_evidence_press.png` | Evidence pool — press / news | Page 3 evidence strip |
| `06_chat.png` | Chat with a cited answer visible | Page 3 proof row A |
| `07_data_source_ribbon.png` | Data-source ribbon / multi-source bar | Page 2 |
| `09_send_data_window.png` | Send data / field submission window | Page 4 field row |
| `11_write_report_window.png` | Write report / PBO upload window | Page 4 field row |

### Optional extras (not in brochure HTML)

| File | Screen |
|------|--------|
| `08_upper_right_corner_controls.png` | Header controls — future one-pagers / posters |
| `10_logo_name_slogan.png` | Brand lockup — future cover polish |

## Capture hints

1. **01** — Full home with component list; ensure date in footer.
2. **02** — Expand the most active component; one narrative sentence + `[source]` visible.
3. **03** — Evidence pool for field visits; show verbatim excerpts if present.
4. **04** — Evidence pool for regional PBO report.
5. **05** — Evidence pool for press / news source.
6. **06** — Ask: “What should I verify in the field today?” — capture answer with citation.
7. **07** — Data-source ribbon with multiple sources visible.
8. **09** — Send data / submission window with upload or send UI.
9. **11** — Write report window for regional PBO upload.

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

Use browser devtools or OS screenshot at 1440×900 while following [`../copy/demo-script.md`](../copy/demo-script.md). Save with the exact filenames in the table above.
