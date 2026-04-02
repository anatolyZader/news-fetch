---
allowed-tools: Bash(node business_modules/resilience/input/analyze-resilience.js*), Bash(node business_modules/resilience/input/extract-signals.js*), Bash(ls articles-audio-*)
description: Run 8-component resilience analysis on radio broadcast transcripts across the last 3 days combined
---

## Your task

Run the 8-component resilience analysis combining all radio transcript files from the last 3 days. Do NOT ask for confirmation — just go.

**Step 1 — Find audio transcript files for the last 3 days**

List all available radio transcript files:
```
ls articles-audio-ashams-*.md articles-audio-tzafon-1045-*.md 2>/dev/null
```

From the results, select files dated within the last 3 days (today, yesterday, 2 days ago) relative to today's date from the context above. Collect them into a comma-separated list.

If no files are found, report that no transcripts are available and stop.

**Step 2 — Analyse (3-day combined)**

Run with `--content-kind audio`, `--no-field-reports`, and all files found in Step 1. Pass `--date <today>` since audio filenames don't follow the homefront naming pattern:
```
node business_modules/resilience/input/analyze-resilience.js --content-kind audio --no-field-reports --files <comma-separated file list> --date <today's date>
```

Note: temporal weighting (today=1.0, yesterday=0.85, 2 days ago=0.70) is not applied in explicit `--files` mode — all files are weighted equally. This is acceptable for radio analysis.

**Step 3 — Extract signals per date**

For each date that has transcript files, run extract-signals to save per-date intermediate signal files. Group files by date (extract date from filename, e.g. `articles-audio-ashams-2026-04-01T09-00.md` → `2026-04-01`) and run once per date:
```
node business_modules/resilience/input/extract-signals.js --source-type radio --files <files for that date> --date <YYYY-MM-DD>
```

After all steps complete, report:
- Which stations and dates were included
- The per-component scores and confidence levels
- The path of the written report file
- Which signal files were written (e.g. `signals/signals-radio-2026-03-31.json`, `signals/signals-radio-2026-04-01.json`)
