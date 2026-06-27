# Poster A3 — ops rooms / field meetings (EN)

> Production spec for an A3 poster (297×420 mm), English LTR. EN mirror of `poster-a3-field-he.md`. Copy grounded in product strings (`footer.json`) and `MESSAGING-HOUSE.md`. Passes `do-not-say.md`. **Working name** — confirm branding is locked before printing (see warning in MESSAGING-HOUSE.md).

---

## Layout (top to bottom)

```
┌─────────────────────────────────────────┐
│  [srulik logo]            Srulik's lab   │   header
│                                          │
│        Community resilience · Daily      │   tagline (footer.tagline)
│             assessment                   │
│                                          │
│   ┌───────────────────────────────────┐  │
│   │  Sent a report? It enters the     │  │   headline (large)
│   │  assessment.                      │  │
│   └───────────────────────────────────┘  │
│                                          │
│   Evidence-backed daily homefront        │   subhead (footer.description)
│   resilience assessment from news,        │
│   social media, field reports, and        │
│   manual submissions.                     │
│                                          │
│   3 ways to report:                       │   action block
│   ① Regional report (PBO) — markdown      │
│   ② WhatsApp bot — a short observation    │
│   ③ Submit evidence in the app            │
│                                          │
│   ┌────────┐                             │
│   │  QR    │   Scan → srulik.ai          │   QR + URL
│   └────────┘                             │
│                                          │
│  Sources: news · WhatsApp · radio ·       │   sources line (footer.dataSources)
│  Google Trends · user submissions         │
└─────────────────────────────────────────┘
```

## Text content (to copy)

**Header:** Srulik's lab
**Tagline:** Community resilience · Daily assessment
**Headline:** Sent a report? It enters the assessment.
**Subhead:** Evidence-backed daily homefront resilience assessment from news, social media, field reports, and manual submissions.

**"3 ways to report" block:**
- ① Regional report (PBO) — upload a regional markdown file
- ② WhatsApp bot — send a short observation
- ③ Submit evidence manually in the app

**Under the QR:** Scan → srulik.ai · Read the assessment and ask the chat about it · Your observation = a signal in the daily assessment.
**Sources line:** Data sources include news, WhatsApp, radio/audio, Google Trends, and user submissions.

## Design spec

- **Size:** A3 (297×420 mm), portrait. Safe margin 12 mm, bleed 3 mm.
- **Direction:** LTR. Left-aligned text.
- **Typography:** headline ≥ 80pt, subhead ≥ 28pt, body ≥ 20pt — legible from 2–3 m.
- **QR:** ≥ 40×40 mm, high contrast, ≥ 4-module quiet zone. Generate with `generate-qr.sh`.
- **Logo:** `client/public/logo_srulik_1.png`.
- **Colors:** match the app palette (dark/light). At least AA contrast.
- **Export:** PDF/X for print, CMYK.

## What to leave out (do-not-say digest)

- No single number / score as a headline.
- No "AI predicts" or "knows in advance."
- No internal/analyst concepts (calibration, action compass, evidence-quality banners).
