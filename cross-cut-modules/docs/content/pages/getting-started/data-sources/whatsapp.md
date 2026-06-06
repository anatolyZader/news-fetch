---
title: "WhatsApp"
description: "Approved community group messages and structured report flows."
intent: getting-started
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/getting-started/data-sources/whatsapp"
version: "current"
tags: ["getting-started", "user", "data-source"]
---

## What it is
Messages from **approved community WhatsApp groups** (passive ingest → daily export → extract-signals). **Structured guided reports** use **direct messages** to the business number — same backend as the site **Write report** panel, not the group pipeline. Engineering detail: repo `docs/main_docu_files/PIPELINE-AND-SOURCES.md` (Guided report section).

## In the app
Open **Data sources** → **WhatsApp** (or the tab your deployment labels for group ingestion). Review what was collected before trusting a sudden score move.

## When to use it
- Ground-truth a narrative that news has not picked up yet
- Audit which groups contributed today
- Connect or operate the integration → [WhatsApp integration](../../guides/whatsapp-integration.md)

## Troubleshooting
- **Empty or stale** — group approval and ingestion are operator-controlled; contact your admin.
- **Report bot vs groups** — structured bot submissions appear under [Report bot](report-bot.md); passive group traffic is here.
