---
title: "VibeSwitch Docs"
description: "Get started, learn concepts, follow guides, and use the API reference."
intent: getting-started
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/"
version: "current"
tags: ["getting-started", "user"]
slug: /
---

## What is VibeSwitch?
VibeSwitch turns daily homefront evidence—news, WhatsApp group traffic, audio/radio coverage, and manual submissions—into a single daily assessment you can read quickly, **and** drill into when you need proof.

If you’re here to *use the product* (not deploy it), start with **[Get started](getting-started/get-started.md)** or [Using the app (first report)](getting-started/using-the-app.md).

## Where should I start?
- **I'm new — show me the app** → [Get started](getting-started/get-started.md)
- **I want to read today’s assessment** → [Using the app (first report)](getting-started/using-the-app.md)
- **I want to connect WhatsApp** → [WhatsApp integration](guides/whatsapp-integration.md)
- **I run this every day** → [Operate the daily pipeline](https://docs.vibeswitch.ai/guides/operating-daily-pipeline)
- **Something is broken** → [Common failures](https://docs.vibeswitch.ai/operations/common-failures)

If you’re a developer/operator deploying a new instance, use:
- [Install & run (local)](https://docs.vibeswitch.ai/getting-started/install-and-run)
- [Deploy (production)](https://docs.vibeswitch.ai/getting-started/deploy)
- [Auth setup](https://docs.vibeswitch.ai/getting-started/auth-setup)

## How the system stays trustworthy
- **Evidence-first**: every score should be traceable to concrete sources.
- **Deterministic scoring**: LLMs help extract signals and write narrative; code computes scores. See [Scoring model](concepts/scoring-model.md).

## Troubleshooting
- **I opened Docs and it feels “too technical”**
  - **Check**: whether you’re reading Concepts/Architecture pages.
  - **Fix**: in the in-app Docs panel, keep **Advanced: off** to stay in the user guide. Use search only when you need a specific term.
- **I can’t find the page I saw earlier**
  - **Check**: the page might be hidden in user mode.
  - **Fix**: toggle **Advanced: on** in the in-app docs sidebar, or search by title.
