---
title: "Scoring model"
description: "How deterministic scoring works and how confidence is computed."
intent: concepts
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/concepts/scoring-model"
version: "current"
tags: ["concepts", "scoring"]
---

## Purpose
Explain how VibeSwitch turns a bag of typed signals into bounded component scores and calibrated confidence values — entirely in code, without an LLM in the scoring loop. This page covers the formula, the reasons for that boundary, and what changes in scoring vs. what stays fixed.

## Prerequisites
- **Required**: Understanding of signals as typed evidence objects with intensity and confidence. See [Signal taxonomy](signal-taxonomy.md).
- **Useful**: [Resilience model](resilience-model.md) for context on components.

## Inputs
- **Signals**: typed evidence objects, each with an `intensity` ∈ [0, 1] and a `confidence` ∈ [0, 1].
- **Mapping**: a deterministic weight table — which signal types contribute to which components and with what weight. This lives in code, version-controlled alongside the rest of the resilience module.
- **Normalization curve**: the function that turns a raw weighted sum into a bounded output (e.g., 1–10).

## Outputs
- **Component scores**: typically a bounded scale (1–10) per component. Not "ratings" — indicators whose meaning is stable over time because the formula is stable.
- **Confidence**: an independent value per component, derived from the quantity and quality of supporting signals.
- **Overall assessment**: an aggregate across components (when defined) for top-line use in dashboards.

## Constraints
- **The LLM does not score.** Extraction and narrative are LLM jobs. Scoring is Node code. This separation is what makes scores reproducible and defensible, and it's the single most important design rule in the project.
- **Auditability.** Every score must be explainable as the output of the weight table applied to the signals that were present. If you can't derive the score from the signals on disk, something in the pipeline is non-deterministic and needs fixing.
- **Stability over cleverness.** Weights change rarely and only with an explicit rationale. Small weight tweaks are tempting and usually mask an evidence problem rather than solving one.
- **Bounded outputs.** Raw weighted sums are unbounded; component scores are bounded by design so they're legible to users.

## The scoring formula (conceptual)

For each component, the raw weighted sum across its mapped signals is:

```
raw = Σᵢ wᵢ × intensityᵢ × confidenceᵢ
```

Where:

- `wᵢ` — the weight for signal `i`'s type in this component's mapping. Can be positive (degrades resilience) or negative (bolsters it), depending on the component's semantics.
- `intensityᵢ` — how strong this specific signal instance is.
- `confidenceᵢ` — how much we trust this signal.

That raw value is then passed through a normalization curve (for instance, a shifted sigmoid) to produce a bounded component score (for example, 1–10).

**Confidence for the component** is derived separately from the signals' quantity and quality — not from the raw sum. A component with one high-confidence signal should still have moderate confidence; a component with many independent, concrete signals earns higher confidence. The exact formula is deliberately conservative to avoid over-claiming on thin evidence.

## Examples

### Walk-through

Suppose the "services" component has these signals on a given day:

- `service_disruption` (weight 1.0): intensity 0.8, confidence 0.9 — school closure in city A.
- `service_disruption` (weight 1.0): intensity 0.5, confidence 0.8 — partial bus route closure in city B.
- `mutual_aid` (weight −0.3): intensity 0.6, confidence 0.9 — community center set up for displaced families.

Raw weighted sum:

```
(1.0 × 0.8 × 0.9) + (1.0 × 0.5 × 0.8) + (−0.3 × 0.6 × 0.9)
= 0.72 + 0.40 − 0.162
= 0.958
```

Normalize this to the 1–10 scale per the component's curve, and report. Confidence is moderate — three signals, two direct, one mitigating — not "high," which would need more independent corroboration.

### What the user sees

The UI doesn't render raw sums. It shows:

- A bounded component score.
- Confidence.
- The evidence items (with quoted text) that contributed.

The user can walk from the score back to each piece of evidence in two clicks — that's the auditability guarantee.

### What we intentionally *don't* do

- We don't ask the LLM "what should this component score be?" Even if it would be directionally right, it would be non-reproducible.
- We don't expose raw weighted sums as scores. Raw values are unbounded and not legible without normalization.
- We don't conflate intensity and confidence. An intense signal we don't trust is different from a mild signal we trust completely.

## Troubleshooting
- **Scores change day-to-day in ways that feel random**
  - **Check**: whether inputs changed (new articles in the export, extraction prompt edits, new sources enabled).
  - **Fix**: pin the inputs by date, version the prompts, and treat any change as deliberate. Then rerun and compare — the difference should be attributable to specific added/removed signals.
- **Confidence is always low**
  - **Check**: whether signals are being dropped during validation (unknown type, missing evidence field, bad dates).
  - **Fix**: align the taxonomy between extraction and validation; ensure extraction is producing grounded evidence; ingest more sources if evidence is genuinely thin.
- **Weights have been tweaked and the diff is hard to follow**
  - **Check**: version history of the weight table.
  - **Fix**: every weight change should be a named, documented decision. If you find yourself tuning weights to hit a target score, you're solving the wrong problem.
- **Same inputs produce different scores on reruns**
  - **Check**: which stage is non-deterministic. Scoring is pure Node code; if scoring output differs, the inputs differ or the code changed.
  - **Fix**: run with fixed inputs from dated artifacts, and bisect against code history.
- **A score is hard to justify to a reader**
  - **Check**: can you walk from the score back to the weight table and the signals? If so, the model is being honest — the argument moves to whether the weights are right.
  - **Fix**: treat the conversation as a review of weights and taxonomy, not a negotiation over numbers. Update the weights (or enrich the taxonomy) and note the change.

See [Resilience model](resilience-model.md) for component definitions and [Signal taxonomy](signal-taxonomy.md) for the input side.
