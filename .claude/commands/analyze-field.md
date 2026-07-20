---
allowed-tools: Bash(node business_modules/resilience_scorer/input/extract-signals.js*), Bash(ls articles-visits-reports-*), Bash(ls articles-field-reports-*)
description: Extract resilience signals from the most recent visits reports file and save under business_modules/visits/data/signals/
---

## Your task

Extract behavioral signals from the most recent visits reports file. Do NOT ask for confirmation — just go.

**Step 1 — Find the most recent visits reports file**

```
ls business_modules/visits/data/articles-visits-reports-*.md 2>/dev/null | sort | tail -1
```

If none, fall back to legacy name:

```
ls business_modules/visits/data/articles-field-reports-*.md 2>/dev/null | sort | tail -1
```

If no file is found, report that no visits reports are available and stop.

**Step 2 — Extract signals**

Run:
```
node business_modules/resilience_scorer/input/extract-signals.js --source-type visits --files <file from step 1> --date <date from filename YYYY-MM-DD>
```

Extract the date from the filename (e.g. `articles-visits-reports-2026-03-24.md` → date `2026-03-24`).

After completion, report:
- Which file was processed
- How many signals were extracted
- The path of the written signal file (`business_modules/visits/data/signals/signals-visits-{date}.json`)
