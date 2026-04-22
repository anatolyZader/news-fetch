---
title: "News ingestion (homefront)"
description: "Fetch and pre-filter main news into homefront markdown exports for analysis."
intent: guides
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/guides/news-ingestion"
version: "current"
tags: ["guides", "ingestion", "news", "user"]
---

## What you’re doing (in plain terms)
This step pulls today’s news, keeps only the items that look **homefront-relevant**, and writes a dated markdown file that the assessment can use as evidence.

If your report is empty or stale, this is usually the first thing an operator reruns.

## Run it

### Fetch and write today’s export

```bash runnable
npm run homefront-to-md
```

Expected: a dated file appears under `business_modules/news-sites/articles_extracted/` (and logs show how many articles were kept).

### Backfill a specific date

```bash runnable
npm run homefront-to-md -- 2026-04-18
```

Expected: `articles-homefront-2026-04-18.md` appears in `business_modules/news-sites/articles_extracted/`.

## What it produces
- A “latest” file (overwritten each run): `business_modules/news-sites/articles_extracted/articles-homefront.md`
- A dated archive: `business_modules/news-sites/articles_extracted/articles-homefront-YYYY-MM-DD.md`

Open the dated file to confirm it doesn’t look obviously wrong (0 articles, wrong topic, etc.).

## Troubleshooting
- **The export is empty**
  - **Most common cause**: upstream returned little, or the filter rejected everything.
  - **Fix**: backfill a known active date to sanity check; if that works, adjust the query/keywords.
- **The file is written somewhere unexpected**
  - **Cause**: `HOMEFRONT_MD` override is set.
  - **Fix**: unset it and rerun.
- **Costs jumped**
  - **Cause**: the number of candidate articles grew; filtering cost scales with candidates.
  - **Fix**: tighten the upstream query and review caps (see [Cost controls](../operations/cost-controls.md)).

