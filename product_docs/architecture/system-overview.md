---
title: "System overview"
description: "High-level architecture: ingestion, storage, analysis, and UI."
intent: architecture
audience: ["customer", "internal"]
stability: beta
canonical: "https://docs.vibeswitch.ai/architecture/system-overview"
version: "current"
tags: ["architecture"]
llm:
  chunkHint: "Prefer explicit component boundaries."
---

## Purpose
Provide an operator-level understanding of the major subsystems and how data flows through them.

## Prerequisites
- **Required**: Familiarity with Node.js services and a React frontend

## Inputs
- **Ingestion sources**: web URLs, submissions, WhatsApp, audio/video

## Outputs
- **Persisted evidence**: stored evidence and derived artifacts
- **Assessments**: reports and dashboards in the UI

## Constraints
- **Separation of concerns**: business logic lives in `business_modules/`; UI in `client/`
- **Operational safety**: background work must have timeouts and clear failure signals

## Examples
Data flow (high-level):
- Ingest → normalize evidence → store → analyze → render report → allow follow-up chat

## Troubleshooting
- **Reports stop updating**\n  - **Check**: ingestion sources, background queue status, and API keys\n  - **Fix**: verify environment variables and inspect server logs for upstream failures

