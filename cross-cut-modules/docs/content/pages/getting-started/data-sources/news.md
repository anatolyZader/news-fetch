---
title: "News"
description: "Homefront-filtered articles from configured wire and API feeds."
intent: getting-started
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/getting-started/data-sources/news"
version: "current"
tags: ["getting-started", "user", "data-source"]
---

## What it is
Homefront-filtered news articles from configured wire and API feeds. Usually the **broadest public picture** of the day.

## In the app
Open **Data sources** → **News**. Browse today's articles and filters. District scope (National, North, etc.) applies on this tab when your team uses regional views.

## When to use it
- Sanity-check a score against mainstream coverage
- See what headlines may have influenced a component narrative
- Operators maintaining the pipeline should see [News ingestion](../../guides/news-ingestion.md)

## Troubleshooting
- **No articles today** — ingestion may not have finished; ask your operator or try another feed.
- **Article missing** — not every outlet is in every deployment; Send data can flag a link for review.
