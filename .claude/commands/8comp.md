---
allowed-tools: Bash(npm run homefront-to-md), Bash(node business_modules/resilience/input/extract-signals.js*), Bash(node business_modules/resilience/input/assess-signals.js*), Bash(ls articles-audio-* articles-field-reports-*), Bash(node business_modules/whatsapp/input/whatsapp-to-md.js*), Bash(ls articles-whatsapp-*), Bash(node business_modules/pbo_report_muni/input/extract-pbo-signals.js*), Bash(mkdir -p logs), Bash(tail*), Agent
description: Full daily pipeline — fetch news, extract signals from all sources, run combined 8-component assessment
---

## Your task

Run the full daily resilience pipeline for today: fetch news, extract signals from all available sources (news, radio, field), then run the combined 8-component assessment. Do NOT ask for confirmation — just go.

---

**Step 0 — Read pipeline config**

Read `pipeline-config.json` in the project root. It contains a `sources` object with toggles for each data source (`news`, `radio`, `whatsapp`, `field`, `pbo`, `naftali`, `social`). **Skip all extraction steps for sources where `enabled` is `false`.** Social ingest uses `npm run social-media:gather-daily` (see `/8comp-3-north`), not `extract-signals.js`. If the file is missing, treat all sources as enabled.

Initialize the run log:
```
mkdir -p logs && echo "=== Pipeline run: national <today's date> ===" > logs/pipeline-run-national-<today's date>.log
```

---

**Step 1 — Fetch today's news articles** *(skip if `news` is disabled)*

```
npm run homefront-to-md
```

**Step 2 — Extract news signals** *(skip if `news` is disabled)*

```
node business_modules/resilience/input/extract-signals.js --source-type news --files articles-homefront.md --date <today's date> 2>> logs/pipeline-run-national-<today's date>.log
tail -3 logs/pipeline-run-national-<today's date>.log
```

**Step 3 — Extract radio signals (if transcripts exist for today)** *(skip if `radio` is disabled)*

List today's radio transcripts:
```
ls articles-audio-*<today's date>*.md 2>/dev/null
```

If files are found, run:
```
node business_modules/resilience/input/extract-signals.js --source-type radio --files <comma-separated file list> --date <today's date> 2>> logs/pipeline-run-national-<today's date>.log
tail -3 logs/pipeline-run-national-<today's date>.log
```

If no radio transcripts exist for today, skip this step and continue.

**Step 4 — Export WhatsApp messages and extract signals** *(skip if `whatsapp` is disabled)*

Export today's WhatsApp messages to markdown:
```
node business_modules/whatsapp/input/whatsapp-to-md.js --date <today's date>
```

Check if the output file exists:
```
ls articles-whatsapp-<today's date>.md 2>/dev/null
```

If the file exists and is non-empty, extract signals:
```
node business_modules/resilience/input/extract-signals.js --source-type whatsapp --files articles-whatsapp-<today's date>.md --date <today's date> 2>> logs/pipeline-run-national-<today's date>.log
tail -3 logs/pipeline-run-national-<today's date>.log
```

If no WhatsApp messages exist for today, skip this step.

**Step 5 — Extract field signals (most recent field report)** *(skip if `field` is disabled)*

Find the most recent field reports file:
```
ls business_modules/visits/data/articles-field-reports-*.md 2>/dev/null | sort | tail -1
```

If found, extract the date from the filename (e.g. `articles-field-reports-2026-03-31.md` → `2026-03-31`) and run:
```
node business_modules/resilience/input/extract-signals.js --source-type field --files <file> --date <date-from-filename> 2>> logs/pipeline-run-national-<today's date>.log
tail -3 logs/pipeline-run-national-<today's date>.log
```

If no field reports exist, skip this step and continue.

**Step 6 — Extract PBO municipality signals** *(skip if `pbo` is disabled)*

Convert PBO municipality Excel reports into signals:
```
node business_modules/pbo_report_muni/input/extract-pbo-signals.js 2>> logs/pipeline-run-national-<today's date>.log
tail -3 logs/pipeline-run-national-<today's date>.log
```

This processes all available Excel files in `business_modules/pbo_report_muni/`. If none exist, skip this step.

**Step 7 — Run combined assessment**

```
node business_modules/resilience/input/assess-signals.js --date <today's date> --days 1 2>> logs/pipeline-run-national-<today's date>.log
tail -5 logs/pipeline-run-national-<today's date>.log
```

**Step 8 — Final report**

Spawn an Agent with this prompt, substituting the actual date for `<today's date>`:

> Summarize a completed resilience pipeline run. Do the following in order:
>
> 1. Read `logs/pipeline-run-national-<today's date>.log` (the full execution log).
> 2. Scan the log for a line like `Reports written:` and note the `.json` path listed beneath it. If not found, run: `ls daily_reports/resilience-report-<today's date>-*.json 2>/dev/null | grep -v north | tail -1`
> 3. Read that JSON report file.
> 4. Return a markdown summary with:
>    - Which sources were included (news / radio / whatsapp / field / pbo) and which were skipped
>    - Any warnings or errors from the log
>    - Per-component scores: id, score, confidence, signal_count
>    - Report file path
