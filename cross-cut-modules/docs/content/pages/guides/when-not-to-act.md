---
title: "When not to act"
description: "Abstention, thin evidence, and macro context—when the system intentionally withholds verdicts."
intent: guides
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/guides/when-not-to-act"
version: "current"
tags: ["guides", "user"]
---

## Purpose
Help users recognize when Srulik's lab is **correctly refusing** to support a strong conclusion—and what to do instead of treating silence or neutral wording as stability.

## Prerequisites
- **Required**: [User workflow](user-workflow.md) or [Using the app](../getting-started/using-the-app.md).
- **Useful**: [Decision support model](../concepts/decision-support-model.md).

## Do not act on headline scores alone when…

### Thin evidence (majority of components "thin")
- Narratives may under-represent local conditions.
- **Instead**: ingest field/WhatsApp sources; use "limited evidence" instrument flags as prompts, not alarms.

### Sampling blind / abstained assessment
- Headline scores suppressed due to information void.
- **Instead**: treat as **unknown**, prioritize field corroboration and connectivity checks.

### Data void / digital darkness
- Digital channels silent while field may still be active.
- **Instead**: do not interpret silence as calm; read data-void banner and field-anchor mode if shown.

### Macro-only or context signals
- National mood pieces without local behavioral evidence.
- **Instead**: use for information environment context only—not component metrics.

### Non-comparable national comparison
- Source mix mismatch between scopes.
- **Instead**: compare within the same scope over time, not across mismatched baselines.

## When action *is* warranted
- Verified high-salience single signal (`critical single signal` instrument).
- Multiple independent sources with adequate evidence mass and consistent direction.
- Significant delta with contested but heavy evidence—human review required, not automatic dismissal.

## Troubleshooting
- **Users want a number but user view hides it**
  - **Check**: by design—user tier shows instruments, not oracle scores.
  - **Fix**: if you are a developer calibrating the model, use developer view; for ops, stay in narrative mode.
- **I submitted evidence but today's report unchanged**
  - **Check**: submissions apply on the **next** assess run.
  - **Fix**: rerun pipeline when available; evidence submissions apply on the next assess run.
