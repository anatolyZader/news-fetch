---
allowed-tools: Bash(npm run homefront-to-md*), Bash(node business_modules/resilience/input/extract-signals.js*), Bash(node business_modules/resilience/input/assess-signals.js*), Bash(ls articles-audio-* articles-field-reports-* articles-homefront-* articles-whatsapp-* signals/*), Bash(node business_modules/whatsapp/input/whatsapp-to-md.js*), Bash(node business_modules/pbo_report_muni/input/extract-pbo-signals.js*), Bash(node business_modules/pool/input/extract-naftali-signals.js*), Bash(rm signals/signals-*.json)
description: Full 14-day (two-week) northern Israel 8-component pipeline — reuse/extract signals, then run a north-focused assessment in comparison to national context.
---

## Your task

Run the full **14-day (two-week)** resilience pipeline and produce a **north-focused** 8-component assessment centered on northern Israel, with national scores used as comparison context. Do NOT ask for confirmation — just go.

Follow the same argument parsing, date validation, and ingestion steps as `/8comp-7` (14-day window: `target` through `target-13`).

## Critical reuse rule

Do **not** download or extract the same source twice just because both the national and north reports are needed.

The north report is a second assessment over the same `signals/signals-<type>-<date>.json` files used by the national report. If the national 14-day pipeline already ran, skip directly to the final north assessment step.

For every enabled source and window date, use this reuse-first plan:

| Situation | Action |
|---|---|
| `signals/signals-<type>-<date>.json` exists and no `--force` | **reuse** |
| `signals/signals-<type>-<date>.json` exists and `--force` passed | delete and re-extract from existing source `.md` when possible |
| signals missing, source `.md` exists | extract from that `.md` |
| signals missing, source `.md` missing, source is `news` | run `npm run homefront-to-md -- <date>`, then extract |
| signals missing, source `.md` missing, source is `radio` | skip silently |
| signals missing, source `.md` missing, source is `whatsapp` | run local SQLite export, then extract if non-empty |

This reuse-first preflight applies in both today mode and replay mode. Unlike `/8comp-7`, today mode must **not** automatically re-fetch news for dates that already have signals or `articles-homefront-<date>.md`.

If ingestion is needed, run the same steps as `/8comp-7` (Steps 0–7) for all **14 window dates** before assessing.

If all required signal files already exist for the 14-day window, run only:

```
node business_modules/resilience/input/assess-signals.js --date <target date> --days 14 --scope north
```

## Final assessment

```
node business_modules/resilience/input/assess-signals.js --date <target date> --days 14 --scope north
```

This writes a separate report file named like:

```
daily_reports/resilience-report-north-<target date>-<HHMM>.json
daily_reports/resilience-report-north-<target date>-<HHMM>.md
```

After completion, report:
- Mode used (today vs. replay) and `--force` state
- The preflight plan vs. what actually executed
- Which sources and dates contributed to the northern assessment and which were absent
- Number of national signals loaded and number retained by the north scope filter
- Per-component scores and confidence levels
- Path of the written north report file
