---
allowed-tools: Bash(npm run homefront-to-md), Bash(npm run analyze-resilience:*), Bash(node business_modules/resilience/input/extract-signals.js*)
description: Fetch today's homefront news and run 8-component resilience analysis
---

## Your task

Run the full resilience analysis pipeline for today's news. Do NOT ask for confirmation — just go.

**Step 1 — Fetch articles**
Run:
```
npm run homefront-to-md
```

**Step 2 — Analyse**
Run the 8-component resilience analysis against the freshly fetched articles:
```
npm run analyze-resilience -- --files articles-homefront.md --date <today's date>
```

Use today's date (YYYY-MM-DD) from the context above for `--date`.

**Step 3 — Extract signals**
Save intermediate signals for use by `/8comp` and `/8comp-3`:
```
node business_modules/resilience/input/extract-signals.js --source-type news --files articles-homefront.md --date <today's date>
```

After all steps complete, report the overall resilience score and per-component scores from the output, the path of the written report file, and the path of the written signal file.
