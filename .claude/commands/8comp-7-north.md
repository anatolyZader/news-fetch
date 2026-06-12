---
allowed-tools: Bash(npm run homefront-to-md*), Bash(node business_modules/resilience/input/extract-signals.js*), Bash(node business_modules/resilience/input/assess-signals.js*), Bash(ls articles-audio-* articles-field-reports-* articles-homefront-* articles-whatsapp-* signals/*), Bash(node business_modules/whatsapp/input/whatsapp-to-md.js*), Bash(node business_modules/pbo_report_muni/input/extract-pbo-signals.js*), Bash(node business_modules/pool/input/extract-naftali-signals.js*), Bash(rm signals/signals-*.json), Bash(mkdir -p logs), Bash(tail*), Agent
description: Full 14-day (two-week) northern Israel 8-component pipeline — reuse/extract signals, then run a north-focused assessment in comparison to national context.
---

## Your task

Run the full **14-day (two-week)** resilience pipeline and produce a **north-focused** 8-component assessment centered on northern Israel, with national scores used as comparison context. Do NOT ask for confirmation — just go.

Follow the same argument parsing, date validation, and ingestion steps as `/8comp-7` (14-day window: `target` through `target-13`).

Initialize the run log:
```
mkdir -p logs && echo "=== Pipeline run: north <target date> | mode: <today/replay> | force: <yes/no> | window: 14d ===" > logs/pipeline-run-north-<target date>.log
```

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

For all `node extract-signals.js` calls in this phase, append `2>> logs/pipeline-run-north-<target date>.log` and follow each with `tail -3 logs/pipeline-run-north-<target date>.log`.

For PBO and Naftali calls, append `2>> logs/pipeline-run-north-<target date>.log` and follow with `tail -3 logs/pipeline-run-north-<target date>.log`.

If all required signal files already exist for the 14-day window, run only the final assessment below.

## Final assessment

```
node business_modules/resilience/input/assess-signals.js --date <target date> --days 14 --scope north 2>> logs/pipeline-run-north-<target date>.log
tail -5 logs/pipeline-run-north-<target date>.log
```

This writes a separate report file named like:

```
daily_reports/resilience-report-north-<target date>-<HHMM>.json
daily_reports/resilience-report-north-<target date>-<HHMM>.md
```

## Final report

Spawn an Agent with this prompt, substituting the actual target date for `<target date>`:

> Summarize a completed northern resilience pipeline run. Do the following in order:
>
> 1. Read `logs/pipeline-run-north-<target date>.log` (the full execution log).
> 2. Scan the log for a line like `Reports written:` and note the `.json` path listed beneath it. If not found, run: `ls daily_reports/resilience-report-north-<target date>-*.json 2>/dev/null | tail -1`
> 3. Read that JSON report file.
> 4. Return a markdown summary with:
>    - Mode used (today/replay) and --force state
>    - The preflight plan vs. what actually executed (sources and dates that ran, were reused, or were skipped — infer from log entries)
>    - Which sources and dates contributed to the northern assessment and which were absent
>    - Number of national signals loaded and number retained by the north scope filter (from log)
>    - Any warnings or errors in the log
>    - Per-component scores: id, score, confidence, signal_count
>    - Report file path
