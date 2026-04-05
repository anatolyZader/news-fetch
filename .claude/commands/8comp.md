---
allowed-tools: Bash(npm run homefront-to-md), Bash(node business_modules/resilience/input/extract-signals.js*), Bash(node business_modules/resilience/input/assess-signals.js*), Bash(ls articles-audio-* articles-field-reports-*), Bash(node business_modules/whatsapp/input/whatsapp-to-md.js*), Bash(ls articles-whatsapp-*), Bash(node business_modules/pbo_report_muni/input/extract-pbo-signals.js*)description: Full daily pipeline — fetch news, extract signals from all sources, run combined 8-component assessment
---

## Your task

Run the full daily resilience pipeline for today: fetch news, extract signals from all available sources (news, radio, field), then run the combined 8-component assessment. Do NOT ask for confirmation — just go.

---

**Step 1 — Fetch today's news articles**

```
npm run homefront-to-md
```

**Step 2 — Extract news signals**

```
node business_modules/resilience/input/extract-signals.js --source-type news --files articles-homefront.md --date <today's date>
```

**Step 3 — Extract radio signals (if transcripts exist for today)**

List today's radio transcripts:
```
ls articles-audio-*<today's date>*.md 2>/dev/null
```

If files are found, run:
```
node business_modules/resilience/input/extract-signals.js --source-type radio --files <comma-separated file list> --date <today's date>
```

If no radio transcripts exist for today, skip this step and continue.

**Step 4 — Export WhatsApp messages and extract signals**

Export today's WhatsApp messages to markdown:
```
node business_modules/whatsapp/input/whatsapp-to-md.js --date <today's date>
```

Check if the output file exists:
```
ls articles-whatsapp-<today's date>.md 2>/dev/null
```

If the file exists and is non-empty, extract signals:
```
node business_modules/resilience/input/extract-signals.js --source-type whatsapp --files articles-whatsapp-<today's date>.md --date <today's date>
```

If no WhatsApp messages exist for today, skip this step.

**Step 5 — Extract field signals (most recent field report)**

Find the most recent field reports file:
```
ls articles-field-reports-*.md 2>/dev/null | sort | tail -1
```

If found, extract the date from the filename (e.g. `articles-field-reports-2026-03-31.md` → `2026-03-31`) and run:
```
node business_modules/resilience/input/extract-signals.js --source-type field --files <file> --date <date-from-filename>
```

If no field reports exist, skip this step and continue.

**Step 6 — Extract PBO municipality signals**

Convert PBO municipality Excel reports into signals:
```
node business_modules/pbo_report_muni/input/extract-pbo-signals.js
```

This processes all available Excel files in `business_modules/pbo_report_muni/`. If none exist, skip this step.

**Step 7 — Run combined assessment**

```
node business_modules/resilience/input/assess-signals.js --date <today's date> --days 1
```

After completion, report:
- Which sources were included (news / radio / whatsapp / field / pbo) and which were skipped
- The per-component scores and confidence levels
- The path of the written report file
