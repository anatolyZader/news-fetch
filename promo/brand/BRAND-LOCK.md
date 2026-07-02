# Brand lock — srulik.ai / Srulik's lab

> **Locked 2026-06-25.** Authoritative naming and visual rules for print, digital promo, and external outreach. See also [`COLORS.md`](COLORS.md) and [`../source-corpus/MESSAGING-HOUSE.md`](../source-corpus/MESSAGING-HOUSE.md).

---

## Locked names

| Context | Name |
|---------|------|
| Public / URL / legal footer | **srulik.ai** |
| In-app product name | **Srulik's lab** |
| PWA short name | **Srulik** |
| Category (say this) | Daily homefront decision-support |
| Category (never say) | News aggregator · resilience-score app · prediction engine |

## Taglines (locked)

| Lang | Tagline |
|------|---------|
| EN | Community resilience · Daily assessment |
| HE | חוסן קהילתי · הערכה יומית |

## One-liner (promo EN)

> Evidence-backed daily homefront resilience assessment from news, social media, field reports, and manual submissions.

## Data-sources line (exact wording — do not paraphrase)

> Data sources include news, WhatsApp, radio/audio, Google Trends, and user submissions.

---

## Logo assets

| File | Use |
|------|-----|
| `client/public/logo_srulik_1_no_text.png` | Icon-only — app header, small surfaces, QR-adjacent |
| `client/public/logo_srulik_1.png` | Full wordmark when available |
| `client/public/favicon_srulik_1.png` | Favicon, tiny surfaces |

### Lockup rules

- **Primary (brochure cover, slides):** icon + “Srulik's lab” wordmark beside or below icon.
- **Icon-only:** when space &lt; 40 mm wide or beside QR.
- **Clear space:** at least the height of the icon on all sides.
- **Minimum print width:** icon lockup ≥ 15 mm; wordmark legible at 8 pt minimum.
- **Do not:** stretch, rotate, add effects, place on busy photos without a solid backing plate.
- **QR quiet zone:** ≥ 4 modules; do not overlay logo inside QR.

---

## Typography (print / brochure)

| Role | Stack |
|------|-------|
| EN headlines + body | `Inter`, `Segoe UI`, system-ui, sans-serif |
| HE (Wave 2) | `Heebo`, `Arial`, sans-serif |
| Monospace (URLs, rare) | `ui-monospace`, monospace |

---

## Sign-off checklist (before bulk print)

- [ ] `BRAND-LOCK.md` complete (this file)
- [ ] https://srulik.ai serves HTTPS and health check OK
- [ ] Stakeholder approval recorded: _________________ date _______
- [ ] Brochure PDF version date noted in outreach README
- [ ] QR test-scanned from physical proof
- [ ] `do-not-say.md` pass on final copy

---

## Rename procedure (if ever needed)

Find-replace tokens across `promo/**`, then app: `Srulik's lab`, `srulik.ai`, `Srulik`, logo filenames, nginx/DNS scripts. Re-export all print PDFs and regenerate QR.
