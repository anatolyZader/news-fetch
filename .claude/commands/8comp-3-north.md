---
allowed-tools: Bash(npm run homefront-to-md*), Bash(npm run social-media:gather-daily*), Bash(node business_modules/social_media/input/socialMediaInput.js*), Bash(node business_modules/resilience/input/extract-signals.js*), Bash(node business_modules/resilience/input/assess-signals.js*), Bash(npm run extract-observations*), Bash(ls articles-audio-* articles-field-reports-* articles-homefront-* articles-whatsapp-* signals/* business_modules/signals_extraction/data/observations-pipeline-* business_modules/social_media/data/signals-social-*.json), Bash(node business_modules/whatsapp/input/whatsapp-to-md.js*), Bash(node business_modules/pbo_report_muni/input/extract-pbo-signals.js*), Bash(node business_modules/pool/input/extract-naftali-signals.js*), Bash(export RESILIENCE_OPEN_EXTRACT_PARALLEL=1), Bash(mkdir -p logs), Bash(tail*), Agent
description: Full 3-day northern Israel 8-component pipeline — always re-extract closed + open paths from source .md, gather social OSINT, then north-focused assessment.
---

<!-- Pipeline sources: news, radio, whatsapp, field, pbo, naftali, social.
     Adding a source/step here? Also add PipelineAction + executeIngestStep case in
     business_modules/resilience/app/pipelineOrchestrator.js and an entry in PIPELINE_ACTIONS
     (business_modules/resilience/app/pipelineIngestPlan.js). -->

## Your task

Run the full 3-day resilience pipeline and produce a north-focused 8-component assessment centered on northern Israel, with national scores used as comparison context. Do NOT ask for confirmation — just go.

Follow the same argument parsing and date validation as `/8comp-3`.

The 3 dates to cover are: target, target-1, target-2.

### Argument parsing

Accept up to two whitespace-separated tokens after the command name:

1. **Optional date** `dd:mm:yyyy` or `dd/mm/yyyy` → **replay mode**. Absent → **today mode** (target = today from context).
2. **Optional flag** `--force` → also re-fetch/re-gather source `.md` files and social OSINT where they already exist (extra API cost). Without `--force`, still **always re-extract** signals and open observations from existing `.md` files.

Validate:
- If a date is supplied but is not `dd:mm:yyyy` or `dd/mm/yyyy`, stop with `Usage: /8comp-3-north [dd:mm:yyyy|dd/mm/yyyy] [--force]`.
- After converting to `YYYY-MM-DD`: if the date is **in the future**, stop with `Error: target date <date> is in the future`.

**Internally, convert the user date to `YYYY-MM-DD`** for all file paths, filenames, and CLI flags. Example: `15:04:2026` or `15/04/2026` → `2026-04-15`.

Initialize the run log:
```
mkdir -p logs && echo "=== Pipeline run: north <target date> | mode: <today/replay> | force: <yes/no> ===" > logs/pipeline-run-north-<target date>.log
```

## Always re-extract rule (closed + open paths)

**Do not reuse** existing bundles for assessment inputs — always re-extract from source `.md` so assess loads freshly improved extractors.

**Never delete** prior `signals/signals-<type>-<date>.json` or `observations-pipeline-<type>-<date>.json` files. Do **not** run `rm` on signal or observation bundles. When re-extraction overwrites the canonical filename, the extractors automatically **archive** the previous file to a sibling `archive/` directory (timestamped copy) before writing the new bundle.

`extract-signals` runs **both** paths in one invocation:
- **Closed:** `signals/signals-<type>-<date>.json` (canonical overwritten; prior → `signals/archive/`)
- **Open:** `business_modules/signals_extraction/data/observations-pipeline-<type>-<date>.json` (prior → `.../data/archive/`)

Before any extraction, ensure the open parallel path is enabled:
```
export RESILIENCE_OPEN_EXTRACT_PARALLEL=1
```

Do **not** download or extract the same source twice within one run. The north report is a second **assessment** over the same freshly extracted bundles — not a second extraction pass.

For every **enabled** source and window date {target, target-1, target-2}, use this plan:

| Situation (per source × date) | Action |
|---|---|
| Source `.md` exists on disk | **always re-extract** via `extract-signals` (archives then overwrites canonical closed + open bundles) |
| Source `.md` missing, source is `news` | run `npm run homefront-to-md -- <date>`, then extract |
| Source `.md` missing, source is `radio` | **skip silently** |
| Source `.md` missing, source is `whatsapp` | run `whatsapp-to-md.js --date <date>`; if output non-empty, extract |
| `--force` passed and `.md` already exists | **re-fetch/re-export** the `.md` first, then extract |

Unlike `/8comp-3` replay mode, **do not skip extraction** when old signal files exist. Unlike `/8comp-3` today mode, **do not** automatically re-fetch news when `articles-homefront-<date>.md` already exists (unless `--force`).

Print a compact preflight table (source × date → action: extract / fetch-then-extract / skip) before proceeding.

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

Run extraction for **every** enabled source and window date where source `.md` exists (or can be fetched). Always re-extract — never skip because old `signals-*.json` or `observations-pipeline-*.json` exist.

**Field:** extract from **every** `articles-field-reports-*.md` for each window date (today and replay). Assess includes all visit signal bundles on or before target date.

**PBO (3-day window only):** for target, target-1, target-2 always run `extract-pbo-signals.js --date <date>` (archives prior bundles, then writes fresh `signals-pbo-<date>.json` + `observations-pipeline-pbo-<date>.json`).

**Naftali:** re-extract within the 3-day window when source data exists.

For all `node extract-signals.js` calls in this phase, append `2>> logs/pipeline-run-north-<target date>.log` and follow each with `tail -3 logs/pipeline-run-north-<target date>.log`.

For PBO calls use `extract-pbo-signals.js --date <YYYY-MM-DD>` per window day. Append `2>> logs/pipeline-run-north-<target date>.log` and follow with `tail -3 logs/pipeline-run-north-<target date>.log`.

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
>    - Which sources and dates were re-extracted (closed + open bundles) and which were absent
>    - Social: findings count per date (X vs Telegram platforms), from log
>    - Number of national signals loaded and number retained by the north scope filter (from log)
>    - Any warnings or errors in the log
>    - Per-component scores: id, score, confidence, signal_count
>    - Report file path
