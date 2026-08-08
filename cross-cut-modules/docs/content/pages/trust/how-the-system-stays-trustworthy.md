---
title: "How the system stays trustworthy"
description: "Decision-support design, evidence-first claims, and deterministic scoring."
intent: trust
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/trust/how-the-system-stays-trustworthy"
version: "current"
tags: ["trust", "user"]
---

## Core principles
- **Decision-support first** — scores and narratives narrow attention; users record judgment via the review bar.
- **Evidence-first** — every claim should trace to concrete sources you can expand in the report.
- **Deterministic scoring** — LLMs extract and narrate; code scores. Same inputs should yield the same numbers.

## In the app
- **Epistemic banner** and **evidence overview** on the daily report — how much to trust today's synthesis.
- **Evidence lists** under each component — proof mode before you act.
- **Review bar** — record your judgment when a score deserves a second look.

## Learn more
- [When not to act](../guides/when-not-to-act.md) — when thin or contested evidence should slow you down.
- [Scoring model](../concepts/scoring-model.md) and [Decision support model](../concepts/decision-support-model.md) — full technical write-ups on [docs.srulik.ai](https://docs.vibeswitch.ai/).

## Troubleshooting
- **Score feels wrong but evidence looks thin** — treat it as low confidence; see [When not to act](../guides/when-not-to-act.md).
- **I want the math and pipeline** — open **Open full docs** for Concepts and Architecture, or visit [docs.srulik.ai](https://docs.vibeswitch.ai/).
