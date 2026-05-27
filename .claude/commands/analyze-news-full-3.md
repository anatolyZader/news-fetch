---
allowed-tools: Bash(npm run homefront-to-md), Bash(npm run extract-signals:*), Bash(npm run assess-signals:*)
description: Fetch today's homefront news and run 8-component resilience analysis across the last 3 days of articles combined
---

## Your task

Run the full resilience analysis pipeline combining the last 3 days of articles, with differential temporal weighting. Do NOT ask for confirmation — just go.

**Step 1 — Fetch today's articles**
Run:
```
npm run homefront-to-md
```

**Step 2 — Extract signals (per day)**

For today and the prior two days, extract news signals when dated article files exist:
```
npm run extract-signals -- --source-type news --files articles-homefront-<YYYY-MM-DD>.md --date <YYYY-MM-DD>
```

Also extract from `articles-homefront.md` for today if that is the only file available.

**Step 3 — Assess (3-day combined, with temporal weighting)**
```
npm run assess-signals -- --date <today's date> --days 3 --scope national
```

Use today's date (YYYY-MM-DD) from the context above for `--date`.

After all steps complete, report:
- How many total articles were analyzed and from how many days (shown in the Sources line of the output)
- The per-component scores and confidence levels
- The path of the written report file
