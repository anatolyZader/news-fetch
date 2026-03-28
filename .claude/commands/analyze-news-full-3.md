---
allowed-tools: Bash(npm run homefront-to-md), Bash(npm run analyze-resilience:*)
description: Fetch today's homefront news and run 8-component resilience analysis across the last 3 days of articles combined
---

## Your task

Run the full resilience analysis pipeline combining the last 3 days of articles, with differential temporal weighting. Do NOT ask for confirmation — just go.

**Step 1 — Fetch today's articles**
Run:
```
npm run homefront-to-md
```

**Step 2 — Analyse (3-day combined, with temporal weighting)**

Run without `--files` so the pipeline auto-detects all available prior-day article files and applies the correct temporal weights (today=1.0, yesterday=0.85, 2 days ago=0.70):
```
npm run analyze-resilience -- --date <today's date>
```

Use today's date (YYYY-MM-DD) from the context above for `--date`.

The pipeline will automatically include `articles-homefront.md` (today) plus any existing `articles-homefront-<YYYY-MM-DD>.md` files from the previous two days, and will log the weights applied per file.

After both steps complete, report:
- How many total articles were analyzed and from how many days (shown in the Sources line of the output)
- The per-component scores and confidence levels
- The path of the written report file
