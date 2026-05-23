# Social OSINT report — 2026-05-23
- **Window:** 2026-05-23 → 2026-05-23 (1 days)
- **Platforms:** x, telegram_public
- **Verified findings:** 4
- **Pipeline signals:** 4
- **Extracted at:** 2026-05-23T11:51:05.952Z
- **Treated at:** 2026-05-23T11:51:05.954Z
## Access limitations

- X/Twitter may require authenticated access — unauthenticated fetchers often fail.
- TikTok often returns generic pages to non-app fetchers.
- Reddit may block automated fetchers on reddit.com and old.reddit.com.
- Facebook posts frequently require login; only some public pages are partially accessible.
- Public Telegram t.me/s/ channel pages may truncate posts and omit full dates.
- Some Hebrew forums (e.g. Rotter) may return HTTP 403 on direct fetch.

## Findings

### telegram-newsk8-1963 — קריית שמונה

- **Platform:** telegram_public
- **Date:** 2026-05-23
- **Confidence:** גבוהה
- **Component:** lifesaving_behavior
- **URL:** https://t.me/newsk8/1963

> בהמשך להתרעות שהופעלו בקריית שמונה, פיקוד העורף מעדכן כעת כי ניתן לצאת מהמרחבים המוגנים.

*Behavior / emotion:* תושבים יוצאים ממרחבים מוגנים

### telegram-newsk8-1962 — קריית שמונה

- **Platform:** telegram_public
- **Date:** 2026-05-23
- **Confidence:** גבוהה
- **Component:** lifesaving_behavior
- **URL:** https://t.me/newsk8/1962

> בשל חדירת כלי טייס עוין לאיזורנו, התושבים מתבקשים להיכנס למרחב מוגן ולשהות בו עד לקבלת הודעה אחרת.

*Behavior / emotion:* תושבים נכנסים למרחבים מוגנים

### telegram-Hatufim_israel-175012 — כפר גלעדי

- **Platform:** telegram_public
- **Date:** 2026-05-23
- **Confidence:** גבוהה
- **Component:** lifesaving_behavior
- **URL:** https://t.me/Hatufim_israel/175012

> השוהים במרחב מוגן באזורים הבאים יכולים לצאת: כפר גלעדי. האירוע הסתיים.

*Behavior / emotion:* תושבים יוצאים ממרחבים מוגנים

### telegram-Hatufim_israel-174987 — קריית שמונה

- **Platform:** telegram_public
- **Date:** 2026-05-23
- **Confidence:** גבוהה
- **Component:** lifesaving_behavior
- **URL:** https://t.me/Hatufim_israel/174987

> השוהים במרחב מוגן באזורים הבאים יכולים לצאת: קריית שמונה. האירוע הסתיים.

*Behavior / emotion:* תושבים יוצאים ממרחבים מוגנים

## Mapped signals (pipeline)

- `compliance_enter_shelter` (repeated_pattern) — בהמשך להתרעות שהופעלו בקריית שמונה, פיקוד העורף מעדכן כעת כי ניתן לצאת מהמרחבים המוגנים. (קריית שמונה) — תושבים יוצאים ממרחבים מוגנים
- `compliance_enter_shelter` (repeated_pattern) — בשל חדירת כלי טייס עוין לאיזורנו, התושבים מתבקשים להיכנס למרחב מוגן ולשהות בו עד לקבלת הודעה אחרת. (קריית שמונה) — תושבים נכנסים למרחבים מוגנים
- `compliance_enter_shelter` (repeated_pattern) — השוהים במרחב מוגן באזורים הבאים יכולים לצאת: כפר גלעדי. האירוע הסתיים. (כפר גלעדי) — תושבים יוצאים ממרחבים מוגנים
- `compliance_enter_shelter` (repeated_pattern) — השוהים במרחב מוגן באזורים הבאים יכולים לצאת: קריית שמונה. האירוע הסתיים. (קריית שמונה) — תושבים יוצאים ממרחבים מוגנים
