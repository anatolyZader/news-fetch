---
title: "System dataflow"
description: "End-to-end mental model: inputs → evidence → signals → scoring → reports."
intent: concepts
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.srulik.ai/concepts/system-dataflow"
version: "current"
tags: ["concepts", "architecture", "dataflow"]
---

## Purpose
Give you a mental model of how a piece of text — a news article, a WhatsApp message, a transcribed radio segment, a pasted paragraph — becomes a scored, evidence-backed component of the daily report. Once this model is clear, the rest of the docs (guides, operations, API) slot into place.

## Prerequisites
- **Required**: None — this is the conceptual entry point.
- **Useful**: Skimming the [Quickstart](https://docs.srulik.ai/getting-started/quickstart) first so "ingest" and "report" aren't abstract.

## Inputs
- **News**: articles fetched from NewsAPI.ai and filtered for homefront relevance.
- **WhatsApp**: messages ingested via webhook and/or exported to markdown.
- **Audio / video**: recordings transcribed with OpenAI Whisper.
- **Manual submissions**: evidence pasted into the UI via the top input bar.

## Outputs
- **Evidence store**: normalized evidence items persisted in SQLite.
- **Signals**: typed, structured fragments extracted from evidence — a closed vocabulary.
- **Assessment report**: scored components, narrative summary, and evidence appendix.
- **UI surfaces**: the Report tab, per-domain dashboards (Education, Municipalities, Naftali), and follow-up chat.

## Constraints
- **Traceability**: every signal must be attributable to a source (URL / message ID / transcript offset) and a date. If you can't cite it, it's not a signal.
- **Stability of scoring**: scoring is deterministic Node code. LLMs are used for *extraction* and *narrative*, not for *math*. This separation is the reason scores are reproducible.
- **Date discipline**: the pipeline is date-scoped. Every stage's artifact is named with a date; you should be able to replay any past day from the dated artifacts without touching live upstream APIs.

## The five stages

```
┌────────────┐   ┌──────────┐   ┌─────────┐   ┌────────┐   ┌─────┐
│  Sources   │──▶│ Evidence │──▶│ Signals │──▶│ Scores │──▶│ UI  │
│ (news, WA, │   │  store   │   │ (typed, │   │ + nar- │   │+ API│
│ audio,     │   │ (SQLite) │   │ closed  │   │ rative │   │     │
│ manual)    │   │          │   │ vocab)  │   │ (det.) │   │     │
└────────────┘   └──────────┘   └─────────┘   └────────┘   └─────┘
```

1. **Ingest.** Source-specific scripts pull and normalize raw content (markdown exports per source, per date).
2. **Store.** Normalized evidence rows land in SQLite with provenance (URL, timestamp, source type).
3. **Extract signals.** An LLM reads each evidence item and emits typed signals — one signal per behavioral fact — each grounded in a direct quote, action, or statistic.
4. **Score.** Node code maps signals to components via a deterministic weighted table; a bounded score and confidence are computed. The LLM is not involved in this step.
5. **Present.** A narrative paragraph is generated (LLM, read-only with respect to scores), the report is cached, and the UI renders it with the evidence appendix and chat follow-ups.

## Examples

### End-to-end flow (high level)

A news article about kindergarten closures arrives via NewsAPI → the pre-filter keeps it because it matches homefront criteria → it lands in the dated homefront export → signal extraction emits a `service_disruption` signal citing the exact sentence about closures → the scoring mapping contributes that signal's weighted intensity × confidence to the "services" component → the report narrative mentions it as one of today's service impacts → the UI shows the score with the quoted sentence as evidence.

### What "deterministic" buys you

Given the same dated exports and the same code version, rerunning steps 3–5 produces the same report. That means:

- You can replay a past day to compare.
- A reviewer can reproduce your numbers from the artifacts you shipped.
- Silent cost drift, prompt drift, or mapping drift shows up as a deliberate change in a diff — not a mysterious difference on Monday morning.

### Where LLMs are allowed

- **Allowed**: filtering candidate articles, extracting signals from evidence, writing narrative text, answering chat follow-ups grounded in on-page evidence.
- **Not allowed**: computing component scores, ranking severity, deciding confidence. Those are Node code against a weights table.

## Troubleshooting
- **Report looks correct but evidence feels missing**
  - **Check**: whether the dated exports for that day contain the expected content.
  - **Fix**: rerun ingestion for the missing source/date, then regenerate the assessment. See [Operate the daily pipeline](https://docs.srulik.ai/guides/operating-daily-pipeline).
- **Signals exist but scoring surprises you**
  - **Check**: the signal→component mapping and the weights table.
  - **Fix**: treat mapping changes as deliberate, documented decisions; don't silently tune weights to get a target score. See [Scoring model](scoring-model.md).
- **The same day produces different reports across runs**
  - **Check**: whether the dated input files changed between runs (new articles added, extraction prompts edited).
  - **Fix**: pin inputs by reading from the dated artifacts rather than re-fetching upstream, and version the prompts that extraction uses.
