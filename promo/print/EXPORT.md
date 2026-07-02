# Export brochure to PDF

Source: [`brochure-hq-en.html`](brochure-hq-en.html) + [`brochure-hq-en.css`](brochure-hq-en.css)

## Quick open

```bash
./open-brochure.sh
# or
xdg-open promo/print/brochure-hq-en.html
```

## Print PDF (physical print shop)

1. Open `brochure-hq-en.html` in **Chrome** or **Edge**.
2. Replace screenshot placeholders with real PNGs per [`../screenshots/SCREENSHOT-MANIFEST.md`](../screenshots/SCREENSHOT-MANIFEST.md).
3. **Print** (Ctrl/Cmd+P):
   - Destination: **Save as PDF**
   - Paper: **A4**
   - Margins: **None** (or **Minimum** if layout clips)
   - **Background graphics:** ON
   - Scale: 100%
4. Save as `brochure-hq-en-print.pdf`.

**Physical print:** 170–200 gsm matte; saddle-stitch or stapled 4-page booklet; one proof copy before bulk. Provide CMYK conversion at the print shop if needed.

## Digital PDF (email attachment)

Same steps as print PDF. Verify:

- Link on `srulik.ai` is clickable in the PDF viewer
- File size under ~5 MB (compress screenshots if needed)
- Save as `brochure-hq-en-digital.pdf`

Large PDFs are gitignored — commit HTML/CSS only unless you choose otherwise.

## Headless export (optional)

If Playwright Chromium deps are installed (see PATH note below for `sudo`):

```bash
CHROME="$HOME/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
"$CHROME" --headless --disable-gpu --no-sandbox \
  --print-to-pdf=promo/print/brochure-hq-en-print.pdf --print-to-pdf-no-header \
  "file://$(pwd)/promo/print/brochure-hq-en.html"
```

### Linux: install Playwright system deps

`sudo npx` fails because root’s PATH has no nvm `node`/`npx`. Use:

```bash
sudo env PATH="$HOME/.nvm/versions/node/$(node -v | tr -d v)/bin:$PATH" npx playwright install-deps chromium
```

## Before export

Complete [`PRE-PRINT-CHECKLIST.md`](PRE-PRINT-CHECKLIST.md).
