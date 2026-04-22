---
title: "Resilience model"
description: "Core mental model: signals → scoring → outputs."
intent: concepts
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/concepts/resilience-model"
version: "current"
tags: ["concepts", "signals", "scoring"]
llm:
  chunkHint: "Keep each subsection independently answerable."
---

## Purpose
Explain the core abstraction VibeSwitch is built around: *resilience* as a set of measurable components, each fed by typed signals drawn from concrete evidence, aggregated into bounded scores with calibrated confidence. This page defines what resilience means in this system, why we break it into components, and how the scoring turns into the daily assessment users see.

## Prerequisites
- **Required**: Familiarity with your input sources (news, WhatsApp, audio).
- **Useful**: [System dataflow](system-dataflow.md) for the pipeline view.

## Inputs
- **Evidence items**: normalized, text-like artifacts with provenance (source type, URL, date, content).
- **A signal taxonomy**: a closed vocabulary of signal types that describe what an evidence item *says about behavior or state*. See [Signal taxonomy](signal-taxonomy.md).
- **A component set**: the resilience components that make up the overall assessment (e.g. security, services, information, psychological state, community cohesion, leadership). The exact list and weights live in the resilience module.

## Outputs
- **Signals**: structured, comparable indicators extracted from evidence.
- **Component scores**: each component scored on a bounded scale (commonly 1–10), with an independent confidence value.
- **Overall narrative**: a paragraph of plain-language context that helps a reader interpret the scores without reading every piece of evidence.

## Constraints
- **Determinism boundary is non-negotiable.** Extraction and narrative are LLM jobs. Scoring is Node code. Moving scoring into the LLM is tempting and has always been a mistake — it destroys reproducibility.
- **Traceability.** Every signal links back to a specific piece of evidence. Every score links back to the signals that produced it. If you can't walk from a score back to source quotes, that's a bug worth fixing before tuning weights.
- **Confidence is earned, not asserted.** A component with two thin signals should have low confidence. High confidence requires multiple, independent, concrete pieces of evidence.
- **No numerical anchoring in writing.** When we describe a component, we talk about evidence and trends — "service disruptions reported across three municipalities" — not the number. The number is an aggregate indicator, not the argument.

## Components, signals, and why

Think of resilience as a panel of gauges, not a single dial.

- **Components** are the gauges: security, services, information environment, psychological state, cohesion, leadership, and so on. Each tracks a different facet of how a community absorbs stress.
- **Signals** are the typed readings that move the gauges: `service_disruption`, `panic_rumor_spread`, `mutual_aid`, `leadership_message`, etc. Each signal is attached to a specific observed event, not an interpretation.
- **Weights** map signals to components. A `service_disruption` moves the services gauge; `mutual_aid` moves the cohesion gauge positively; a signal can contribute to multiple components with different weights.

Breaking resilience into components instead of a single score means:

- A bad day for services doesn't falsely drag down cohesion.
- A reviewer can ask "why is this component here?" and be answered with specific evidence.
- We can track which components are robust and which degrade first under stress.

## Examples

### Conceptual flow

- **Evidence**: "WhatsApp group reports kindergarten closed on Sunday due to alerts."
- **Signal**: `service_disruption` (evidence text quoted; intensity based on reach/duration; confidence based on source quality).
- **Effect on score**: contributes to the services component; may also weakly contribute to psychological state if compounded with panic-related signals.
- **Effect on narrative**: "Services were disrupted in at least one locale; parents reported short-notice closures." The narrative names the evidence, not a score.

### What a "high confidence, low score" day looks like

High confidence, low severity: many signals agree that today was quiet. The report says so plainly. This is the goal — a calm day should read as calm, not as "neutral by default."

### What a "low confidence" day looks like

Thin evidence, contradictory reports. The report surfaces the thinness explicitly: "Limited evidence for services today — two isolated reports, one unverified." That's a prompt to operators to ingest more sources, not a reason to distrust the model.

## Troubleshooting
- **Signals look right but scoring feels wrong**
  - **Check**: the mapping from signal → component weights and the score-normalization curve.
  - **Fix**: adjust weights deliberately and document the decision. Don't tune until the number looks right — tune until the mapping is defensible.
- **A component's confidence is always low**
  - **Check**: whether the taxonomy for that component is under-specified or the evidence is genuinely thin.
  - **Fix**: enrich the taxonomy, ingest more sources, or accept that confidence should be low on days with thin evidence.
- **A reader disagrees with a score**
  - **Check**: walk the evidence trail together. Is there a signal you both agree is under- or over-weighted? Is a piece of evidence missing from the ingest?
  - **Fix**: if there's a missing signal, add it to the taxonomy; if a weight is wrong, update it and note the change. The argument about numbers should always turn into an argument about evidence.

See [Signal taxonomy](signal-taxonomy.md) for the signal side and [Scoring model](scoring-model.md) for the scoring formula.
