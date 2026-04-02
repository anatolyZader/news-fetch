---
allowed-tools: Bash(node business_modules/resilience/input/analyze-resilience.js*), Bash(node business_modules/resilience/input/extract-signals.js*), Bash(ls articles-audio-*)
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

**Step 2 — Analyse**

Run the resilience analysis with `--content-kind audio` and the files found in Step 1:
```
node business_modules/resilience/input/analyze-resilience.js --content-kind audio --no-field-reports --files <comma-separated file list> --date <today's date>
```

**Step 3 — Extract signals**

Save intermediate signals for use by `/8comp` and `/8comp-3`:
```
node business_modules/resilience/input/extract-signals.js --source-type radio --files <comma-separated file list from Step 1> --date <today's date>
```

After all steps complete, report:
- Which stations' transcripts were included
- The per-component scores and confidence levels from the output
- The path of the written report file
- The path of the written signal file (`signals/signals-radio-{date}.json`)
