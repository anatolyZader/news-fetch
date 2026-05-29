---
title: "Decision support model"
description: "Srulik's lab is a decision-support system: it narrows attention; humans decide under uncertainty."
intent: concepts
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/concepts/decision-support-model"
version: "current"
tags: ["concepts", "decision-support"]
llm:
  chunkHint: "Anchor page for operator vs system responsibilities."
---

## Purpose
Define what Srulik's lab is **for**: supporting human operator judgment on homefront resilience—not replacing it with automated verdicts.

**Not an oracle.** Scores and narratives narrow attention; operators decide under explicit uncertainty.

## Prerequisites
- **Required**: None.
- **Useful**: [Using the app (first report)](../getting-started/using-the-app.md), [Resilience model](resilience-model.md).

## Inputs
- **Multi-source evidence**: news, WhatsApp, audio/radio, field reports, manual submissions.
- **Operator context**: scope (national/regional), role (operator vs analyst).

## Outputs
- **Attention items**: what changed, what is thin, what is contested.
- **Instrument flags** (operator view): evidence sufficiency—not headline scores alone.

## Constraints
- **Human-in-the-loop is mandatory.** The system abstains when evidence is insufficient (`insufficient_data`, sampling blind, data void).
- **Operator vs analyst tiers.** Default UI hides headline 1–10 scores; analysts may inspect model internals for calibration.
- **Evidence before action.** Every operational decision should trace to cited sources under the relevant component.

## Examples

### Scan → proof → feedback
1. **Scan** the epistemic banner and evidence overview (adequate vs thin components).
2. **Proof** open evidence under any surprising component.
3. **Feedback** submit missing evidence or run the daily pipeline if coverage is thin.

### When the system refuses to score
Data void or sampling blind modes are **features**, not failures. Treat them as prompts to ingest field sources or wait—not as "neutral stability."

## Troubleshooting
- **I expected a number but see "limited evidence"**
  - **Check**: component `instrument` flags and evidence count.
  - **Fix**: read evidence; if thin, submit field reports or wait for more ingest—do not treat absence of score as "all clear."
- **Analyst and operator views disagree**
  - **Check**: you may be in analyst mode (scores visible) vs narrative mode.
  - **Fix**: use narrative mode for operational decisions; analyst mode for calibration only.

See [Operator workflow](../guides/operator-workflow.md) and [When not to act](../guides/when-not-to-act.md).
