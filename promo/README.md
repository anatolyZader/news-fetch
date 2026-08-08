# Promo kit — srulik.ai

Marketing and print materials for **Srulik's lab** (`srulik.ai`). Brand locked per [`brand/BRAND-LOCK.md`](brand/BRAND-LOCK.md).

## Folder map

| Path | Purpose |
|------|---------|
| [`brand/`](brand/) | BRAND-LOCK, COLORS |
| [`source-corpus/`](source-corpus/) | Messaging house, facts, FAQ, do-not-say — feed NotebookLM / ChatGPT |
| [`copy/`](copy/) | One-pagers, demo script, brochure panel copy |
| [`screenshots/`](screenshots/) | UI captures for brochure (see SCREENSHOT-MANIFEST) |
| [`print/`](print/) | Brochure HTML, posters, QR, export instructions |
| [`distribution/`](distribution/) | Email / WhatsApp / LinkedIn templates |

## Production order

1. Read [`brand/BRAND-LOCK.md`](brand/BRAND-LOCK.md) and [`source-corpus/do-not-say.md`](source-corpus/do-not-say.md)
2. Capture screenshots → [`screenshots/SCREENSHOT-MANIFEST.md`](screenshots/SCREENSHOT-MANIFEST.md)
3. Open [`print/brochure-hq-en.html`](print/brochure-hq-en.html) → export PDF per [`print/EXPORT.md`](print/EXPORT.md)
4. Complete [`print/PRE-PRINT-CHECKLIST.md`](print/PRE-PRINT-CHECKLIST.md)
5. Distribute per [`distribution/README-outreach.md`](distribution/README-outreach.md)

## HQ brochure (Wave 1)

- **Copy:** [`copy/brochure-copy-hq-en.md`](copy/brochure-copy-hq-en.md)
- **Layout:** [`print/brochure-hq-en.html`](print/brochure-hq-en.html) + [`print/brochure-hq-en.css`](print/brochure-hq-en.css)
- **Open:** `./print/open-brochure.sh`

## QR code

```bash
cd promo/print && ./generate-qr.sh
# or: node generate-qr-node.js
```

## Wave 2 (not yet)

- Field HE brochure (RTL)
- Recorded demo video per [`copy/demo-script.md`](copy/demo-script.md)

## Screenshots + PDF export

Production **requires sign-in** — pass user credentials or a saved session:

```bash
PROMO_AUTH_EMAIL='you@example.com' PROMO_AUTH_PASSWORD='…' \
  PROMO_BASE_URL=https://srulik.ai node promo/screenshots/capture-brochure-shots.mjs
```

See [`screenshots/SCREENSHOT-MANIFEST.md`](screenshots/SCREENSHOT-MANIFEST.md) for auth options. Then re-export PDF:

```bash
CHROME="$HOME/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
"$CHROME" --headless --disable-gpu --no-sandbox \
  --print-to-pdf=promo/print/brochure-hq-en-print.pdf --print-to-pdf-no-header \
  "file://$(pwd)/promo/print/brochure-hq-en.html"
```

Until screenshots exist, the brochure HTML falls back to `screenshots/PLACEHOLDER.svg`.

See [`CHANGELOG-promo.md`](CHANGELOG-promo.md).
