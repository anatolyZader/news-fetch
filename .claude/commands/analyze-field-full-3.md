---
allowed-tools: Bash(node business_modules/resilience_scorer/input/extract-signals.js*), Bash(ls articles-visits-reports-*), Bash(ls articles-field-reports-*)
description: Extract resilience signals from the last 3 available visits reports files and save under business_modules/visits/data/signals/
---

## Your task

Extract behavioral signals from the last 3 available visits reports files (visits are infrequent — look across all available dates, not just the last 3 calendar days). Do NOT ask for confirmation — just go.

**Step 1 — Find available visits reports files**

```
ls business_modules/visits/data/articles-visits-reports-*.md 2>/dev/null | sort | tail -3
```

If none, fall back to legacy:

```
ls business_modules/visits/data/articles-field-reports-*.md 2>/dev/null | sort | tail -3
```

If no files are found, report that no visits reports are available and stop.

**Step 2 — Extract signals from each file**

For each file found, run:
```
node business_modules/resilience_scorer/input/extract-signals.js --source-type visits --files <file> --date <YYYY-MM-DD from filename>
```

Extract the date from each filename (e.g. `articles-visits-reports-2026-03-24.md` → date `2026-03-24`).

Run each extraction sequentially (visits reports are small — no need to parallelize).

After all complete, report:
- Which files were processed and dates
- How many signals were extracted per file
- Paths of written signal files (`business_modules/visits/data/signals/signals-visits-{date}.json`)
