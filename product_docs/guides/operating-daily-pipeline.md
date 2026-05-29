---
title: "Operate the daily pipeline"
description: "Day-to-day workflow for ingesting sources, extracting signals, and producing reports."
intent: guides
audience: ["internal"]
stability: beta
canonical: "https://docs.srulik.ai/guides/operating-daily-pipeline"
version: "current"
tags: ["guides", "operations", "pipeline", "user"]
---

## What this page is for
If you’re the person responsible for making sure **today’s report is ready**, this is your checklist.

The pipeline is designed so you can rerun a stage safely. The goal is not “never fail”—it’s “fail in a way you can restart.”

## Daily flow (recommended)
1. **Ingest sources** (news first; WhatsApp/audio if enabled).
2. **Spot-check the exports** (make sure today’s files aren’t empty).
3. **Run extraction + assessment**.
4. **Open the UI and confirm** the report date is today and evidence looks sane.
5. **Skim cost logs** (if you’re monitoring budget).

## The commands you’ll actually run

### Full pipeline (most common)

```bash runnable
./scripts/daily-pipeline.sh
```

Expected: logs announce each stage and end with an assessment written for `YYYY-MM-DD`.

### Skip transcription (if audio is flaky or expensive)

```bash runnable
./scripts/daily-pipeline.sh --no-transcribe
```

Expected: audio transcription is skipped; the rest runs.

### Backfill a past day (news)

```bash runnable
npm run homefront-to-md -- 2026-04-18
```

Expected: the dated export appears, and you can rerun assessment for that date.

### Confirm the UI can see today’s report

```bash runnable
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/report/today
```

Expected: `200` when a report is present, `404` if it hasn’t been generated/cached yet.

## Troubleshooting
- **The report is stale (yesterday)**
  - **Check**: did today’s pipeline actually finish?
  - **Fix**: rerun `./scripts/daily-pipeline.sh` and refresh the UI.
- **A stage was skipped**
  - **Check**: the expected input file exists for today (exports before extraction; signals before assessment).
  - **Fix**: rerun the missing upstream stage, then rerun the pipeline.
- **Extraction fails intermittently**
  - **Check**: rate limits or budget caps.
  - **Fix**: retry with backoff, narrow inputs, and review caps (see [Cost controls](../operations/cost-controls.md)).
