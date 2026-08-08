---
allowed-tools: Bash(npm run pbo:send-muni-feedback*), Bash(node business_modules/pbo_report_review/input/sendMunicipalPboFeedback.js*), Read
description: Send municipal PBO feedback emails from a revised batch after user confirmation
argument-hint: dd:mm:yyyy
---

## Your task

Send per-municipality PBO feedback emails from the user-revised batch for the given date.

**Step 1 — Parse date**

Arguments: `$ARGUMENTS` (expected `dd:mm:yyyy`). Convert to ISO `YYYY-MM-DD`. If already ISO, use as-is.

**Step 2 — Preview batch (no send yet)**

Batch path:
`business_modules/pbo_report_review/data/reviews/batches/pbo-muni-review-<YYYY-MM-DD>.json`

- If missing, stop and tell the user to run `/review-pbo-reports-muni` first.
- Read the file. List municipalities that would be mailed (`send !== false`, not sufficient, has `officer.email`).
- Note any `missingOfficerEmail` / `send: false` skips.
- Mention `PBO_REVIEW_TEST_EMAIL` redirects all mail when set (safe testing).

**Step 3 — Confirm**

**Ask the user to confirm** before sending. Do not run the send CLI until they explicitly approve.

**Step 4 — Send (only after confirmation)**

```bash
npm run pbo:send-muni-feedback -- --date <YYYY-MM-DD>
```

Optional: `--dry-run` to preview without Resend; `--force` to resend or ignore gapsHash mismatch.

**Step 5 — Report**

Print per-muni `emailSent` / `emailSkipped` / `emailError` from the CLI JSON and the send-log path (`…-send-log.json`).
