---
title: "Report bot"
description: "Structured situational reports via WhatsApp bot or in-app send-report flow."
intent: getting-started
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/getting-started/data-sources/report-bot"
version: "current"
tags: ["getting-started", "user", "data-source"]
---

## What it is
**Structured situational reports** submitted through the WhatsApp Report bot or the in-app **Write report** flow — separate from passive WhatsApp group ingestion. Both surfaces use the same **`report_build`** backend orchestrator; WhatsApp is only the DM transport layer. Engineering detail: repo `docs/main_docu_files/PIPELINE-AND-SOURCES.md` (Guided report section).

## In the app
Open **Data sources** → **Report bot**. Review recent structured submissions and their status.

## When to use it
- Audit who filed what before acting on a sudden local signal
- Distinguish curated reports from raw group chatter ([WhatsApp](whatsapp.md))

## Troubleshooting
- **Submission not visible** — review and ingestion may take until the next daily run.
- **Want to file one** — use **Write report** in the app or your organization's bot number; see [Send data](send-data.md) for lighter inputs.
