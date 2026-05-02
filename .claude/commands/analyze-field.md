---
allowed-tools: Bash(node business_modules/resilience/input/extract-signals.js*), Bash(ls articles-field-reports-*)
description: Extract resilience signals from the most recent field reports file and save under business_modules/visits/data/signals/
---

## Your task

Extract behavioral signals from the most recent field reports file. Do NOT ask for confirmation — just go.

**Step 1 — Find the most recent field reports file**

```
ls business_modules/visits/data/articles-field-reports-*.md 2>/dev/null | sort | tail -1
```

If no file is found, report that no field reports are available and stop.

**Step 2 — Extract signals**

Run:
```
node business_modules/resilience/input/extract-signals.js --source-type field --files <file from step 1> --date <date from filename YYYY-MM-DD>
```

Extract the date from the filename (e.g. `articles-field-reports-2026-03-24.md` → date `2026-03-24`).

After completion, report:
- Which file was processed
- How many signals were extracted
- The path of the written signal file (`business_modules/visits/data/signals/signals-field-{date}.json`)
