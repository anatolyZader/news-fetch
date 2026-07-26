---
allowed-tools: Bash(npm run extract-signals:*), Bash(npm run assess-signals:*), Bash(ls articles-audio-*)
description: Run 8-component resilience analysis on radio broadcast transcripts across the last 3 days combined
---

## Your task

**Billing switch:** If the arguments include `--api`, strip that token and use the plain script names without the `:cli` suffix (e.g. `npm run pipeline:run` instead of `npm run pipeline:run:cli`, `npm run extract-signals` instead of `npm run extract-signals:cli`). `:cli` bills LLM calls to the Max subscription; `--api` forces metered API credits — use it when subscription limits must not interrupt the run.


Run the 8-component resilience analysis combining all radio transcript files from the last 3 days. Do NOT ask for confirmation — just go.

**Step 1 — Find audio transcript files for the last 3 days**

List all available radio transcript files:
```
ls articles-audio-*.md 2>/dev/null
```

From the results, select files dated within the last 3 days (today, yesterday, 2 days ago) relative to today's date from the context above.

If no files are found, report that no transcripts are available and stop.

**Step 2 — Extract signals per date**

For each date that has transcript files, run extract-signals once per date. Group files by date (extract date from filename, e.g. `articles-audio-ashams-2026-04-01T09-00.md` → `2026-04-01`):
```
npm run extract-signals:cli -- --source-type radio --files <files for that date> --date <YYYY-MM-DD>
```

**Step 3 — Assess (3-day combined)**
```
npm run assess-signals:cli -- --date <today's date> --days 3 --scope national
```

After all steps complete, report:
- Which stations and dates were included
- The per-component scores and confidence levels
- The path of the written report file
- Which signal files were written (e.g. `signals/signals-radio-2026-03-31.json`, `signals/signals-radio-2026-04-01.json`)
