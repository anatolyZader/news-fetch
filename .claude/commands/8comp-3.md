---
allowed-tools: Bash(npm run homefront-to-md*), Bash(node business_modules/resilience/input/extract-signals.js*), Bash(node business_modules/resilience/input/assess-signals.js*), Bash(ls articles-audio-* articles-field-reports-* articles-homefront-*), Bash(node business_modules/whatsapp/input/whatsapp-to-md.js*), Bash(ls articles-whatsapp-*), Bash(node business_modules/pbo_report_muni/input/extract-pbo-signals.js*), Bash(node business_modules/naftali/input/extract-naftali-signals.js*)
description: Full 3-day pipeline — fetch news, extract signals from all sources for the last 3 days, run combined assessment
---

## Your task

Run the full 3-day resilience pipeline: fetch today's news, extract signals from all available sources across the last 3 days, then run the combined 8-component assessment with temporal weighting. Do NOT ask for confirmation — just go.

Today's date is the date from context above. The 3 dates to cover are: today, yesterday (today - 1 day), and 2 days ago (today - 2 days).

---

**Step 1 — Fetch news articles for the last 3 days**

Run once for each of the 3 dates: today, yesterday, and 2 days ago.

```
npm run homefront-to-md -- <today's date>
npm run homefront-to-md -- <yesterday's date>
npm run homefront-to-md -- <2-days-ago date>
```

Each run writes `articles-homefront-<date>.md` (date-stamped) and overwrites `articles-homefront.md` with that day's articles. Run sequentially.

**Step 2 — Extract news signals for each day**

For each of the 3 dates, extract signals from its date-stamped file:
```
node business_modules/resilience/input/extract-signals.js --source-type news --files articles-homefront-<date>.md --date <YYYY-MM-DD>
```

Run once per date. Skip a date if its file is missing or empty.

**Step 3 — Extract radio signals for each day that has transcripts**

List all available radio transcript files:
```
ls articles-audio-*.md 2>/dev/null | sort
```

From the results, select files dated within the last 3 days. Group files by date. For each date that has transcripts, run:
```
node business_modules/resilience/input/extract-signals.js --source-type radio --files <comma-separated files for that date> --date <YYYY-MM-DD>
```

Run once per date. Skip dates with no transcripts.

**Step 4 — Export WhatsApp messages and extract signals for each day**

For each of the 3 dates, export WhatsApp messages to markdown:
```
node business_modules/whatsapp/input/whatsapp-to-md.js --date <YYYY-MM-DD>
```

Check if the output file exists:
```
ls articles-whatsapp-<YYYY-MM-DD>.md 2>/dev/null
```

If the file exists and is non-empty, extract signals:
```
node business_modules/resilience/input/extract-signals.js --source-type whatsapp --files articles-whatsapp-<YYYY-MM-DD>.md --date <YYYY-MM-DD>
```

Run once per date. Skip dates with no WhatsApp messages.

**Step 5 — Extract field signals from the last 3 available field report files**

```
ls articles-field-reports-*.md 2>/dev/null | sort | tail -3
```

For each file found, extract the date from the filename (e.g. `articles-field-reports-2026-03-24.md` → `2026-03-24`) and run:
```
node business_modules/resilience/input/extract-signals.js --source-type field --files <file> --date <date-from-filename>
```

Run sequentially, one file at a time. Field visits are infrequent so dates may be older than 3 days — extract them regardless of date.

**Step 6 — Extract PBO municipality signals**

Convert PBO municipality Excel reports into signals:
```
node business_modules/pbo_report_muni/input/extract-pbo-signals.js
```

This processes all available Excel files in `business_modules/pbo_report_muni/`. If none exist, skip this step.

**Step 7 — Extract Naftali questionnaire signals**

Convert Naftali weekly questionnaire responses into signals:
```
node business_modules/naftali/input/extract-naftali-signals.js
```

This processes all available Excel files in `business_modules/naftali/`. If none exist, skip this step.

**Step 8 — Run combined 3-day assessment**

Temporal weights are applied automatically for news and radio (today=1.0, yesterday=0.85, 2 days ago=0.70). Field signal files are included regardless of their date since visits are infrequent.

```
node business_modules/resilience/input/assess-signals.js --date <today's date> --days 3
```

After completion, report:
- Which sources and dates were included (news / radio / whatsapp / field / pbo / naftali) and which were skipped
- The per-component scores and confidence levels
- The path of the written report file
