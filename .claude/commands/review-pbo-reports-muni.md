---
allowed-tools: Bash(npm run pbo:review-muni*), Bash(node business_modules/pbo_report_review/input/runMunicipalPboReview.js*), Read
description: Review all municipal PBO reports for a date into a revisable JSON batch (no mail)
argument-hint: dd:mm:yyyy
---

## Your task

Run municipal PBO completeness review for the given date and write an operator-revisable batch JSON. **Do not send email.**

**Step 1 — Parse date**

Arguments: `$ARGUMENTS` (expected `dd:mm:yyyy`, e.g. `26:07:2026`). Convert to ISO `YYYY-MM-DD` (day:month:year → year-month-day). If the argument is already `YYYY-MM-DD`, use it as-is.

**Step 2 — Export batch**

From `/home/eventstorm1/news` run:

```bash
npm run pbo:review-muni -- --date <YYYY-MM-DD>
```

**Step 3 — Report**

- Print the batch file path (default: `business_modules/pbo_report_review/data/reviews/batches/pbo-muni-review-<YYYY-MM-DD>.json`).
- Print the `summary` object (`total`, `sufficient`, `needsFeedback`, `missingOfficerEmail`).
- Explicitly state: **no mail was sent**.
- Tell the operator they may edit the batch (`send`, `officer.email`, and per-component `components.<id>.questions` / `general.questions`) then run `/send-report-feedback-muni <dd:mm:yyyy>` after confirmation.
