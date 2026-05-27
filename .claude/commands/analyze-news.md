---
allowed-tools: Bash(npm run homefront-to-md), Bash(npm run extract-signals:*), Bash(npm run assess-signals:*)
description: Fetch today's homefront news and run 8-component resilience analysis
---

## Your task

Run the full resilience analysis pipeline for today's news. Do NOT ask for confirmation — just go.

**Step 1 — Fetch articles**
Run:
```
npm run homefront-to-md
```

**Step 2 — Extract signals**
```
npm run extract-signals -- --source-type news --files articles-homefront.md --date <today's date>
```

**Step 3 — Assess**
```
npm run assess-signals -- --date <today's date> --days 1 --scope national
```

Use today's date (YYYY-MM-DD) from the context above for `--date`.

After all steps complete, report the overall resilience score and per-component scores from the output, the path of the written report file, and the path of the written signal file.
