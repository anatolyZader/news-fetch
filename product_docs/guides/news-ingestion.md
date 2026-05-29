---
title: "News ingestion (homefront)"
description: "Fetch and pre-filter main news into homefront markdown exports for analysis."
intent: guides
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.srulik.ai/guides/news-ingestion"
version: "current"
tags: ["guides", "ingestion", "news", "user"]
---

## What you’re doing (in plain terms)
This step pulls today’s news, keeps only the items that look **homefront-relevant**, and writes a dated markdown file that the assessment can use as evidence.

If your report is empty or stale, this is usually the first thing an operator reruns.

## What you will see in the app
- The **Report** tab will cite news articles as evidence.
- If ingestion ran successfully for today, the report will reference fresh articles and today’s date.
- If ingestion did not run, the report may look stale or empty for today.

## What it produces
Operators maintain an internal, auditable export for each day (so they can validate what was kept and why). End users don’t need to run anything manually.

## Troubleshooting
- **The export is empty**
  - **Most common cause**: upstream returned little, or the filter rejected everything.
  - **Fix**: backfill a known active date to sanity check; if that works, adjust the query/keywords.
- **The file is written somewhere unexpected**
  - **Cause**: `HOMEFRONT_MD` override is set.
  - **Fix**: unset it and rerun.
- **Costs jumped**
  - **Cause**: the number of candidate articles grew; filtering cost scales with candidates.
  - **Fix**: tighten the upstream query and review caps (see [Cost controls](https://docs.srulik.ai/operations/cost-controls)).

