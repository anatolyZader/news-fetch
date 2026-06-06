---
title: "Overview"
description: "Input feeds behind the daily assessment — browse them separately from the report."
intent: getting-started
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/getting-started/data-sources"
version: "current"
tags: ["getting-started", "user", "data-source"]
---

## What these are
These are the **inputs** that feed each daily run. The **Daily assessment** view is the synthesized report; **Data sources** in the header lets you audit what went in.

## Browse in the app
1. Open **Data sources** in the header (tab strip below the title).
2. Pick a feed — News, WhatsApp, PBO reports, and the rest.
3. Use **Back to analysis results** to return to today's report.

## Each input feed
- [News](data-sources/news.md) — wire/API articles, usually the broadest public picture
- [WhatsApp](data-sources/whatsapp.md) — approved groups and structured reports
- [Audio and radio](data-sources/audio-radio.md) — transcribed broadcasts and clips
- [PBO reports](data-sources/pbo-reports.md) — field officer municipality and regional files
- [Report bot](data-sources/report-bot.md) — structured situational submissions
- [Visits](data-sources/visits.md) — professional squad field observations
- [Social media](data-sources/social-media.md) — public posts and topic searches
- [Pools (Naftali & Education)](data-sources/pools.md) — longer-cycle themed questionnaires
- [Google Trends](data-sources/google-trends.md) — search-interest early warning
- [Send data (your input)](data-sources/send-data.md) — links and observations you submit

## Troubleshooting
- **I only see some tabs** — your deployment may not ingest every feed; ask your operator which sources are enabled.
- **Empty tab today** — ingestion may still be running or that source had nothing for the date; check another feed or refresh later.
- **I want pipeline details** — operator guides live under [Guides](../guides/operator-workflow.md) and on [docs.srulik.ai](https://docs.vibeswitch.ai/).
