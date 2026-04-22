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
Explain how VibeSwitch turns raw inputs into structured signals and an overall assessment.

## Prerequisites
- **Required**: Understanding of your input sources (e.g. web articles, WhatsApp messages, audio/video)

## Inputs
- **Evidence items**: text-like artifacts with provenance (source type, URL, date, content)

## Outputs
- **Signals**: normalized, comparable indicators extracted from evidence
- **Score / assessment**: an aggregated result that powers dashboards and workflows

## Constraints
- **Determinism**: the model should specify which fields are “strict” vs “heuristic” outputs
- **Traceability**: every signal should link back to evidence and sources

## Examples
Example flow (conceptual):
- Evidence: “WhatsApp group reports…” → Signal: “panic_rumor_spread” → Score impact: +0.2 risk

## Troubleshooting
- **Signals look correct but scoring feels wrong**\n  - **Check**: mapping from signal taxonomy → scoring weights\n  - **Fix**: adjust weights and document the decision rationale, not just the numbers

