---
allowed-tools: Bash(npm run homefront-to-md), Bash(npm run analyze-resilience:*)
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

After both steps complete, report the overall resilience score and per-component scores from the output, and the path of the written report file.
