---
allowed-tools: Bash(npm run extract-signals:*), Bash(npm run assess-signals:*), Bash(ls articles-audio-*)
description: Run 8-component resilience analysis on today's radio broadcast transcripts (ashams + tzafon)
---

## Your task

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
npm run extract-signals -- --source-type radio --files <comma-separated file list> --date <today's date>
```

**Step 3 — Assess**
```
npm run assess-signals -- --date <today's date> --days 1 --scope national
```

After all steps complete, report:
- Which stations' transcripts were included
- The per-component scores and confidence levels from the output
- The path of the written report file
- The path of the written signal file (`signals/signals-radio-{date}.json`)
