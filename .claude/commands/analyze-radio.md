---
allowed-tools: Bash(npm run extract-signals:*), Bash(npm run assess-signals:*), Bash(ls articles-audio-*)
description: Run 8-component resilience analysis on today's radio broadcast transcripts (ashams + tzafon)
---

## Your task

**Billing switch:** If the arguments include `--api`, strip that token and use the plain script names without the `:cli` suffix (e.g. `npm run pipeline:run` instead of `npm run pipeline:run:cli`, `npm run extract-signals` instead of `npm run extract-signals:cli`). `:cli` bills LLM calls to the Max subscription; `--api` forces metered API credits — use it when subscription limits must not interrupt the run.


Run the 8-component resilience analysis on today's radio broadcast transcripts. Do NOT ask for confirmation — just go.

**Step 1 — Find today's audio transcript files**

List transcript files for today's date:
```
ls articles-audio-*<today's date>*.md 2>/dev/null
```

Use today's date (YYYY-MM-DD) from the context above. Collect all matching files into a comma-separated list.

If no files are found for today, report that transcription hasn't run yet and stop.

**Step 2 — Extract signals**
```
npm run extract-signals:cli -- --source-type radio --files <comma-separated file list> --date <today's date>
```

**Step 3 — Assess**
```
npm run assess-signals:cli -- --date <today's date> --days 1 --scope national
```

After all steps complete, report:
- Which stations' transcripts were included
- The per-component scores and confidence levels from the output
- The path of the written report file
- The path of the written signal file (`signals/signals-radio-{date}.json`)
