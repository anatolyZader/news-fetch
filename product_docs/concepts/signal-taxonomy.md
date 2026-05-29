---
title: "Signal taxonomy"
description: "Closed vocabulary of signals, structure, and extraction constraints."
intent: concepts
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.srulik.ai/concepts/signal-taxonomy"
version: "current"
tags: ["concepts", "signals"]
---

## Purpose
Define what a "signal" is in Srulik's lab, why we use a closed vocabulary, and the rules that extraction must follow. If the taxonomy is sharp, extraction is comparable across days, sources, and operators. If it's fuzzy, scores drift in ways no one can explain.

## Prerequisites
- **Required**: You've read [Resilience model](resilience-model.md) and understand that signals feed components.
- **Useful**: Familiarity with a few example signal types from the UI's evidence trail.

## Inputs
- **Evidence**: individual items (article body, WhatsApp message, transcript segment, manual submission) that have been stored with provenance.
- **Extraction prompt**: the LLM instructions that turn evidence into signals, constrained to the taxonomy below.

## Outputs
- **Signals**: structured JSON objects with a typed `signal_type`, the supporting evidence text, bounded intensity and confidence values, and the source metadata needed for traceability.

## Constraints
- **Closed vocabulary.** Every signal must have a `signal_type` from a fixed, versioned list. Extraction that invents a new type is invalid and must be rejected at validation — not passed through to scoring.
- **Atomicity.** One signal represents one behavioral fact. If a single article describes both a service disruption *and* a mutual-aid response, that's two signals, not one merged blob.
- **Evidence-first.** The `evidence` field must be a direct quote, observable action, or cited statistic. Narrative summaries written by the journalist are not signals — they're editorializing. "A school closed early" is a signal; "The situation is tense" is not.
- **Source-grounded.** Every signal carries the source URL or message ID and the `published_at` date. Without that, replay and audit are impossible.
- **No scoring in extraction.** The LLM emits intensity and confidence, but those values are inputs to scoring, not scores themselves. The scoring step applies weights independently.

## Example signal shape

```json
{
  "signal_type": "educational_disruption",
  "evidence": "Kindergarten closed on Sunday due to security situation",
  "scope_level": "quantified_or_broad",
  "intensity": "severe",
  "phase": "response",
  "extraction_confidence": 0.9,
  "article_url": "https://example.com/article"
}
```

Expected:

- `signal_type` is one of the allowed values — not a freeform phrase.
- `evidence` is an attributable fact (quote, action, stat), not an interpretation.
- `intensity` ∈ {`light`, `moderate`, `severe`}: severity of this instance (defaults to `moderate` when omitted).
- `scope_level` ∈ {`single_case`, `repeated_pattern`, `quantified_or_broad`}: breadth of evidence.
- Optional: `phase`, `affected_subgroup`, `affected_system` (continuity signals only), `polarity_override` (whitelist only).
- `extraction_confidence` ∈ [0, 1]: how certain we are this is correctly classified and grounded.
- `source_url` + `published_at` make the signal replayable and auditable.

## Examples

### What counts as a good signal

- **`solidarity_help_others`** with evidence "Residents coordinated overnight food deliveries to displaced families in the community center on Ben-Gurion Street, per the municipal spokesperson." Concrete action, attributed source, specific place.
- **`leadership_clear_guidance`** with evidence "The mayor issued a video statement at 18:00 saying schools would reopen Monday." Observable action, timestamp, clear outcome.
- **`service_disruption`** with evidence "Ramle municipality announced that kindergartens will be closed Sunday." Quoted announcement, specific jurisdiction.
- **`population_survey_finding`** with evidence "Bar-Ilan survey: 68% of northern residents report sleep disruption." Named survey with quantified finding.

### What does *not* count (and why)

- "The atmosphere is tense." → Narrative framing, no observable fact.
- "Many residents are worried." → Unattributed generalization. If a specific report says "60% of respondents in today's municipal survey reported worry," use **`population_survey_finding`** with the number and provenance.
- "This shows a breakdown in trust." → Editorial interpretation. The underlying event might be a signal; the interpretation is the analyst's job.

### Versioning the taxonomy

Adding a signal type is a deliberate, documented act. The extraction code and the scoring mapping share the same list. When you add a type:

1. Add it to the extraction prompt's allowed values.
2. Add it (with a weight) to the scoring mapping.
3. Decide whether to backfill: rerun extraction on recent days so old reports also contain the new type.
4. Note the change in whatever you use as a changelog — silent taxonomy additions look like noise in day-over-day comparisons.

## Troubleshooting
- **Extraction outputs are vague summaries instead of concrete signals**
  - **Check**: whether the extraction prompt allows narrative framings ("the situation is…").
  - **Fix**: tighten the prompt to require quotes/actions/stats. Validate each signal's `evidence` field is a recognizable fact.
- **Extraction outputs unknown `signal_type` values**
  - **Check**: code taxonomy vs. prompt taxonomy — they may have drifted apart.
  - **Fix**: treat the code/validator as source of truth and regenerate prompt accordingly. Reject outputs that don't parse rather than silently dropping them.
- **Intensity and confidence feel uncalibrated**
  - **Check**: whether the extraction prompt gives concrete anchors (e.g., "intensity 0.9 = city-wide, multi-day"). Without anchors, these values drift.
  - **Fix**: anchor both axes with 2–3 worked examples in the prompt.
- **Same event generates different `signal_type` values on reruns**
  - **Check**: the LLM temperature and prompt stability.
  - **Fix**: lower temperature for extraction; consider sampling multiple runs and keeping only signals stable across samples if this persists.
- **A new signal type doesn't appear in any report**
  - **Check**: that you added it to both the extraction prompt *and* the scoring mapping.
  - **Fix**: adding to only one side means the type is either extracted but ignored, or expected but never emitted. Keep both in sync.
