---
allowed-tools: Bash(npm run homefront-to-md*), Bash(npm run social-media:gather-daily*), Bash(node business_modules/social_media/input/socialMediaInput.js*), Bash(node business_modules/resilience/input/extract-signals.js*), Bash(node business_modules/resilience/input/assess-signals.js*), Bash(ls articles-audio-* articles-field-reports-* articles-homefront-* articles-whatsapp-* signals/* business_modules/social_media/data/signals-social-*.json), Bash(node business_modules/whatsapp/input/whatsapp-to-md.js*), Bash(node business_modules/pbo_report_muni/input/extract-pbo-signals.js*), Bash(node business_modules/pool/input/extract-naftali-signals.js*), Bash(rm signals/signals-*.json), Bash(mkdir -p logs), Bash(tail*), Agent
description: Full 3-day northern Israel 8-component pipeline — gather social OSINT (X + Telegram), reuse/extract other signals, then run a north-focused assessment.
---

## Your task

Run the full 3-day resilience pipeline and produce a north-focused 8-component assessment centered on northern Israel, with national scores used as comparison context. Do NOT ask for confirmation — just go.

Follow the same argument parsing and date validation as `/8comp-3`.

The 3 dates to cover are: target, target-1, target-2.

Initialize the run log:
```
mkdir -p logs && echo "=== Pipeline run: north <target date> | mode: <today/replay> | force: <yes/no> ===" > logs/pipeline-run-north-<target date>.log
```

## Critical reuse rule

Do **not** download or extract the same source twice just because both the national and north reports are needed.

The north report is a second assessment over the same `signals/signals-<type>-<date>.json` files used by the national report. If the national 3-day pipeline already ran, skip directly to the final north assessment step **only when** social OSINT bundles for the window are also fresh.

For every enabled source and window date, use this reuse-first plan:

| Situation | Action |
|---|---|
| `signals/signals-<type>-<date>.json` exists and no `--force` | **reuse** |
| `signals/signals-<type>-<date>.json` exists and `--force` passed | delete and re-extract from existing source `.md` when possible |
| signals missing, source `.md` exists | extract from that `.md` |
| signals missing, source `.md` missing, source is `news` | run `npm run homefront-to-md -- <date>`, then extract |
| signals missing, source `.md` missing, source is `radio` | skip silently |
| signals missing, source `.md` missing, source is `whatsapp` | run local SQLite export, then extract if non-empty |

This reuse-first preflight applies in both today mode and replay mode. Unlike `/8comp-3`, today mode must **not** automatically re-fetch news for dates that already have signals or `articles-homefront-<date>.md`.

---

## Step — Social OSINT (X + Telegram) for daily feed + 8-component

Canonical bundles: `business_modules/social_media/data/signals-social-<YYYY-MM-DD>.json`. The **Daily feed** UI sub-tab reads `findings[]` from these files. `assess-signals.js` loads `signals[]` after `treat`.

**Env (required for live fetch):**
- `X_BEARER_TOKEN` — X API v2
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION` — MTProto
- Channels listed in `business_modules/social_media/telegram-public-channels.json`

| Situation (per window date) | Action |
|---|---|
| `signals-social-<date>.json` exists, `extracted_at` is today (Asia/Jerusalem), no `--force` | **reuse** social bundle for that date |
| bundle missing, stale, or `--force` | include date in social gather |

**Social gather** (once for the whole 3-day window — do not run per date):

```
npm run social-media:gather-daily -- --date <target YYYY-MM-DD> --days 3 --north --execute 2>> logs/pipeline-run-north-<target date>.log
tail -5 logs/pipeline-run-north-<target date>.log
```

Pass `--force` on the overall command if re-gathering social evidence. If `X_BEARER_TOKEN` or Telegram is missing, run without `--execute` first to log access notes, then continue with assessment using any existing bundles.

The CLI automatically runs `treat` on dates that received new findings (maps `findings` → `signals[]` for `assess-signals`).

---

## Other signal sources

Run the same reuse-first ingestion as `/8comp-3` for news, radio, whatsapp, field, pbo, naftali (Steps 0–7 in that command) when those signal files are missing — unless **only** social was stale and all `signals/signals-*` already exist.

For all `node extract-signals.js` calls in this phase, append `2>> logs/pipeline-run-north-<target date>.log` and follow each with `tail -3 logs/pipeline-run-north-<target date>.log`.

For PBO and Naftali calls, append `2>> logs/pipeline-run-north-<target date>.log` and follow with `tail -3 logs/pipeline-run-north-<target date>.log`.

---

## Final assessment

```
node business_modules/resilience/input/assess-signals.js --date <target date> --days 3 --scope north 2>> logs/pipeline-run-north-<target date>.log
tail -5 logs/pipeline-run-north-<target date>.log
```

This writes a separate report file named like:

```
daily_reports/resilience-report-north-<target date>-<HHMM>.json
daily_reports/resilience-report-north-<target date>-<HHMM>.md
```

`pipeline-config.json` must have `"social": { "enabled": true }` so social bundles enter the assessment.

---

## Final report

Spawn an Agent with this prompt, substituting the actual target date for `<target date>`:

> Summarize a completed northern resilience pipeline run. Do the following in order:
>
> 1. Read `logs/pipeline-run-north-<target date>.log` (the full execution log).
> 2. Scan the log for a line like `Reports written:` and note the `.json` path listed beneath it. If not found, run: `ls daily_reports/resilience-report-north-<target date>-*.json 2>/dev/null | tail -1`
> 3. Read that JSON report file.
> 4. Return a markdown summary with:
>    - Mode used (today/replay) and --force state
>    - The preflight plan vs. what actually executed (including social gather — reuse/dry_run/execute)
>    - Which sources and dates contributed to the northern assessment and which were absent
>    - Social: findings count per date (X vs Telegram platforms), from log
>    - Number of national signals loaded and number retained by the north scope filter (from log)
>    - Any warnings or errors in the log
>    - Per-component scores: id, score, confidence, signal_count
>    - Report file path
