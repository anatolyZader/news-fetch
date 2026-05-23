---
allowed-tools: Bash(npm run homefront-to-md*), Bash(node business_modules/resilience/input/extract-signals.js*), Bash(node business_modules/resilience/input/assess-signals.js*), Bash(ls articles-audio-* articles-field-reports-* articles-homefront-* articles-whatsapp-* signals/*), Bash(node business_modules/whatsapp/input/whatsapp-to-md.js*), Bash(node business_modules/pbo_report_muni/input/extract-pbo-signals.js*), Bash(node business_modules/pool/input/extract-naftali-signals.js*), Bash(rm signals/signals-*.json)
description: Full 3-day pipeline — fetch news, extract signals from all sources for the last 3 days, run combined assessment. Pass a date to replay a past window from existing files.
---

## Your task

Run the full 3-day resilience pipeline and produce a combined 8-component assessment with temporal weighting. Do NOT ask for confirmation — just go.

### Argument parsing and mode selection

Accept up to two whitespace-separated tokens after the command name:

1. **Optional date** `dd:mm:yyyy` → activates **"replay" mode**. Absent → **"today" mode** (target = today from context).
2. **Optional flag** `--force` → delete existing `signals/signals-{news,radio,whatsapp}-<date>.json` files in the 3-day window before extraction so they are re-generated from source `.md` files. Use sparingly (costs API $).

Validate:
- If a date is supplied but is not `dd:mm:yyyy` (two-digit day, two-digit month, four-digit year, colon-separated), stop with `Usage: /8comp-3 [dd:mm:yyyy] [--force]`.
- After converting to `YYYY-MM-DD`: if the date is **in the future** (greater than today from context), stop with `Error: target date <date> is in the future`.

**Internally, convert the `dd:mm:yyyy` argument to `YYYY-MM-DD`** for all file paths, filenames, and CLI flags below. Example: `15:04:2026` → `2026-04-15`.

The 3 dates to cover are: target, target-1, target-2.

---

**Step 0 — Read pipeline config**

Read `pipeline-config.json`. Skip any source where `enabled: false`. Sources: `news`, `radio`, `whatsapp`, `field`, `pbo`, `naftali`, `social` (social = `business_modules/social_media/data/signals-social-*.json` via `social-media:gather-daily`, not extract-signals). If the file is missing, treat all sources as enabled.

---

**Step 0a — Preflight inventory and plan (replay mode only)**

Before doing any work, for each of the 3 window dates and each enabled source, determine the action and print a plan:

| Situation (per source × date) | Action |
|---|---|
| `signals/signals-<type>-<date>.json` exists AND no `--force` | **reuse** (no API cost) |
| `signals/signals-<type>-<date>.json` exists AND `--force` passed | **delete signals file, then re-extract** |
| signals missing, source `.md` exists on disk | **extract from source** |
| signals missing, source `.md` missing, source is `news` | **fetch via `homefront-to-md`, then extract** |
| signals missing, source `.md` missing, source is `radio` | **skip silently** (radio transcripts are produced by targeted recording tasks, not auto-generated here) |
| signals missing, source `.md` missing, source is `whatsapp` | **run local SQLite export via `whatsapp-to-md.js --date <date>`; if output non-empty, extract** |
| everything missing, no on-disk data | **skip silently** |

**Date-sanity abort:** if the plan shows zero actions and zero reusable signals across all sources and all 3 dates (i.e. nothing to assess), stop with `Error: no signals or source data exist for <target> or the two prior days`.

Print the plan as a compact table (source × date → action), then proceed.

In **today mode**, no preflight is needed — today always fetches, transcribes, exports, extracts for all 3 dates, and the `--force` flag applies as described above.

---

**Step 0b — Apply `--force` (if set)**

If `--force` was passed, delete existing signals files for the 3 window dates for types `news`, `radio`, `whatsapp` (do not touch `field`, `pbo`, `naftali`):
```
rm signals/signals-news-<date>.json signals/signals-radio-<date>.json signals/signals-whatsapp-<date>.json 2>/dev/null
```
Missing files are fine — `rm` will be silent. Do this once for each of the 3 dates.

---

**Step 1 — Fetch news articles** *(skip if `news` is disabled)*

Today mode — always fetch for all 3 dates:
```
npm run homefront-to-md -- <target date>
npm run homefront-to-md -- <target-1 date>
npm run homefront-to-md -- <target-2 date>
```

Replay mode — fetch per window date ONLY if BOTH `signals/signals-news-<date>.json` AND `articles-homefront-<date>.md` are missing. Run sequentially for each qualifying date:
```
npm run homefront-to-md -- <date>
```

Each run writes `articles-homefront-<date>.md` (date-stamped) and overwrites `articles-homefront.md`.

---

**Step 2 — Extract news signals** *(skip if `news` is disabled)*

For each window date, if `signals/signals-news-<date>.json` does NOT exist and `articles-homefront-<date>.md` exists (and is non-empty), run:
```
node business_modules/resilience/input/extract-signals.js --source-type news --files articles-homefront-<date>.md --date <YYYY-MM-DD>
```

Skip dates where the signals file already exists (reuse). Skip dates with no source file.

---

**Step 3 — Extract radio signals** *(skip if `radio` is disabled)*

This command does **not** transcribe raw recordings. Radio transcripts (`articles-audio-*.md`) are produced by targeted per-program recording tasks that the user triggers separately. Here we only consume transcripts that already exist on disk.


List all available radio transcripts:
```
ls articles-audio-*.md 2>/dev/null | sort
```

Group by date. For each window date, if `signals/signals-radio-<date>.json` does NOT exist and at least one `articles-audio-*-<date>T*.md` exists, run:
```
node business_modules/resilience/input/extract-signals.js --source-type radio --files <csv of that date's transcripts> --date <YYYY-MM-DD>
```

Skip dates where the signals file already exists. Skip dates with no transcripts.

---

**Step 4 — Export WhatsApp (local SQLite) and extract signals** *(skip if `whatsapp` is disabled)*

`whatsapp-to-md.js` reads from `data/app.sqlite` — it is **not** a network fetch, so it is safe to use for past dates.

For each window date:
- If `signals/signals-whatsapp-<date>.json` exists, reuse it — skip export and extraction.
- Else: if `articles-whatsapp-<date>.md` does not exist, run:
  ```
  node business_modules/whatsapp/input/whatsapp-to-md.js --date <YYYY-MM-DD>
  ```
- After that, if `articles-whatsapp-<date>.md` exists and is non-empty, run:
  ```
  node business_modules/resilience/input/extract-signals.js --source-type whatsapp --files articles-whatsapp-<date>.md --date <YYYY-MM-DD>
  ```

If the DB has no messages for that date, the export produces nothing — skip silently.

---

**Step 5 — Field signals** *(skip if `field` is disabled; **SKIP ENTIRELY in replay mode** — existing `business_modules/visits/data/signals/signals-field-*.json` are picked up automatically by assess)*

Today mode:
```
ls business_modules/visits/data/articles-field-reports-*.md 2>/dev/null | sort | tail -3
```

For each file, extract the date from the filename and run:
```
node business_modules/resilience/input/extract-signals.js --source-type field --files <file> --date <date-from-filename>
```

---

**Step 6 — PBO municipality signals** *(skip if `pbo` is disabled; **SKIP ENTIRELY in replay mode**)*

Today mode:
```
node business_modules/pbo_report_muni/input/extract-pbo-signals.js
```

---

**Step 7 — Naftali questionnaire signals** *(skip if `naftali` is disabled; **SKIP ENTIRELY in replay mode**)*

Today mode:
```
node business_modules/pool/input/extract-naftali-signals.js
```

---

**Step 8 — Run combined 3-day assessment**

Temporal weights are applied automatically (target=1.0, target-1=0.85, target-2=0.70). Field, PBO, and Naftali are included by recency regardless of date.

```
node business_modules/resilience/input/assess-signals.js --date <target date> --days 3
```

---

**Step 9 — Final report**

After completion, report:
- Mode used (today vs. replay) and `--force` state
- The preflight plan vs. what actually executed (any skips due to missing data)
- Which sources and dates contributed to the assessment (news / radio / whatsapp / field / pbo / naftali) and which were absent
- Per-component scores and confidence levels
- Path of the written report file
