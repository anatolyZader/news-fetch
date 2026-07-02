# Business Card — srulik.ai

> Print spec for a standard 85×55 mm card (3 mm bleed). Grounded in `MESSAGING-HOUSE.md` / `footer.json`. Brand locked per [`../brand/BRAND-LOCK.md`](../brand/BRAND-LOCK.md). QR: `generate-qr.sh` or `generate-qr-node.js`.

---

## Front

```
┌──────────────────────────────────────┐
│  [logo_srulik_1_no_text.png]          │
│                                        │
│  Srulik's lab                          │   product name
│  Community resilience · Daily          │   tagline (footer.tagline)
│  assessment                            │
│                                        │
│                          ┌──────┐      │
│  srulik.ai               │  QR  │      │   URL + QR → srulik.ai
│                          └──────┘      │
└──────────────────────────────────────┘
```

## Back (optional — one line + contact)

```
┌──────────────────────────────────────┐
│                                        │
│  Evidence-backed daily homefront       │   one-liner (footer.description, trimmed)
│  resilience assessment. Humans decide. │
│                                        │
│  [Name] · [Role]                       │
│  [email] · srulik.ai                   │
│                                        │
└──────────────────────────────────────┘
```

## Copy (to set)

- **Product name:** Srulik's lab
- **Tagline:** Community resilience · Daily assessment
- **URL:** srulik.ai
- **Back line:** Evidence-backed daily homefront resilience assessment. Humans decide.

## Spec

- **Size:** 85×55 mm, 3 mm bleed, 3 mm safe margin.
- **QR:** ≥ 18×18 mm, high contrast, ≥ 4-module quiet zone. Test-scan the printed proof before a full run.
- **Logo:** `client/public/logo_srulik_1_no_text.png`.
- **Export:** PDF/X, CMYK, 300 dpi.
- **Compliance:** no score, no "AI predicts," lead with evidence + "humans decide" (see `do-not-say.md`).
