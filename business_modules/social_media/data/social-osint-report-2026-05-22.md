# Social OSINT report — 2026-05-22
- **Window:** 2026-05-22 → 2026-05-22 (1 days)
- **Platforms:** x, telegram_public
- **Verified findings:** 1
- **Pipeline signals:** 1
- **Extracted at:** 2026-05-23T11:51:05.955Z
- **Treated at:** 2026-05-23T11:51:05.956Z
## Access limitations

- X/Twitter may require authenticated access — unauthenticated fetchers often fail.
- TikTok often returns generic pages to non-app fetchers.
- Reddit may block automated fetchers on reddit.com and old.reddit.com.
- Facebook posts frequently require login; only some public pages are partially accessible.
- Public Telegram t.me/s/ channel pages may truncate posts and omit full dates.
- Some Hebrew forums (e.g. Rotter) may return HTTP 403 on direct fetch.

## Findings

### telegram-Hatufim_israel-174969 — זרעית

- **Platform:** telegram_public
- **Date:** 2026-05-22
- **Confidence:** גבוהה
- **Component:** lifesaving_behavior
- **URL:** https://t.me/Hatufim_israel/174969

> השוהים במרחב מוגן באזורים הבאים יכולים לצאת: זרעית. האירוע הסתיים.

*Behavior / emotion:* תושבים יוצאים ממרחבים מוגנים

## Mapped signals (pipeline)

- `compliance_enter_shelter` (repeated_pattern) — השוהים במרחב מוגן באזורים הבאים יכולים לצאת: זרעית. האירוע הסתיים. (זרעית) — תושבים יוצאים ממרחבים מוגנים
