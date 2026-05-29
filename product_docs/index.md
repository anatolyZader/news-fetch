---
title: "Srulik's lab docs"
description: "Get started, learn concepts, follow guides, and use the API reference."
intent: getting-started
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.srulik.ai/"
version: "current"
tags: ["getting-started", "user"]
slug: /
---

## What is Srulik's lab?
Srulik's lab is a **decision-support system** for homefront operators. It turns daily evidence—news, WhatsApp, audio/radio, and manual submissions—into an assessment you can scan quickly and **drill into for proof**. **Not an oracle:** it narrows attention; you decide under explicit uncertainty.

If you're here to *use the product* (not deploy it), start with **[Decision support (quick intro)](getting-started/decision-support.md)** or [Using the app (first report)](getting-started/using-the-app.md).

## Where should I start?
- **What kind of system is this?** → [Decision support (quick intro)](getting-started/decision-support.md)
- **I'm new — show me the app** → [Get started](getting-started/get-started.md)
- **I want to read today’s assessment** → [Using the app (first report)](getting-started/using-the-app.md)
- **Daily operator routine** → [Operator workflow](guides/operator-workflow.md)
- **When should I not act on a score?** → [When not to act](guides/when-not-to-act.md)
- **I want to connect WhatsApp** → [WhatsApp integration](guides/whatsapp-integration.md)
- **I run this every day** → [Operate the daily pipeline](https://docs.srulik.ai/guides/operating-daily-pipeline)
- **Something is broken** → [Common failures](https://docs.srulik.ai/operations/common-failures)

If you’re a developer/operator deploying a new instance, use:
- [Install & run (local)](https://docs.srulik.ai/getting-started/install-and-run)
- [Deploy (production)](https://docs.srulik.ai/getting-started/deploy)
- [Auth setup](https://docs.srulik.ai/getting-started/auth-setup)

## How the system stays trustworthy
- **Decision-support first**: scores and narratives narrow attention; operators record judgment via the review bar.
- **Evidence-first**: every claim should trace to concrete sources.
- **Deterministic scoring**: LLMs extract and narrate; code scores. See [Scoring model](concepts/scoring-model.md) and [Decision support model](concepts/decision-support-model.md).

## Troubleshooting
- **I need architecture, API, or deploy docs**
  - **Fix**: use **Open full docs** in the app, or go to [docs.srulik.ai](https://docs.srulik.ai/).
- **I can't find a page in the in-app docs panel**
  - **Check**: the in-app panel only lists everyday user guides.
  - **Fix**: search within the panel, or open [full docs](https://docs.srulik.ai/) for the complete library.
