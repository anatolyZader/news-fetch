---
allowed-tools: Bash(npm run homefront-to-md*), Bash(npm run extract-signals:*), Bash(npm run assess-signals:*)
description: Fetch today's homefront news and run 8-component resilience analysis
---

## Your task

**Billing switch:** If the arguments include `--api`, strip that token and use the plain script names without the `:cli` suffix (e.g. `npm run pipeline:run` instead of `npm run pipeline:run:cli`, `npm run extract-signals` instead of `npm run extract-signals:cli`). `:cli` bills LLM calls to the Max subscription; `--api` forces metered API credits — use it when subscription limits must not interrupt the run.


Run the full resilience analysis pipeline for today's news. Do NOT ask for confirmation — just go.

**Step 1 — Fetch articles**
Run:
```
npm run homefront-to-md:cli
```

**Step 2 — Extract signals**
```
npm run extract-signals:cli -- --source-type news --files articles-homefront.md --date <today's date>
```

**Step 3 — Assess**
```
npm run assess-signals:cli -- --date <today's date> --days 1 --scope national
```

Use today's date (YYYY-MM-DD) from the context above for `--date`.

After all steps complete, report the overall resilience score and per-component scores from the output, the path of the written report file, and the path of the written signal file.
