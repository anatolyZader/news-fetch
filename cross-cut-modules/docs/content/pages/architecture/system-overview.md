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
Give an operator- or integrator-level understanding of Srulik's lab's major subsystems, what each owns, and how data moves between them. **Architecture serves operator judgment loops**—ingestion and scoring exist to support scan → proof → decide → feedback, not to replace human operators.

After reading this you should be able to locate any behavior of the running system to a subsystem, and reason about the blast radius of a change before you make it.

## Prerequisites
- **Required**: Familiarity with Node.js services and a React frontend.
- **Useful**: [System dataflow](../concepts/system-dataflow.md) for the conceptual pipeline.

## Inputs
- **Ingestion sources**: NewsAPI.ai (news), Meta WhatsApp Cloud API (messages), OpenAI Whisper (audio → text), and user submissions via the UI.
- **Configuration**: server env (secrets, auth posture, SQLite path) and client build-time env (Firebase web config).

## Outputs
- **Persisted evidence** in SQLite, with provenance for every row.
- **Assessment artifacts** on disk (`daily_reports/`, `signals/`, source exports) that the API serves.
- **UI surfaces**: the Report tab, the four domain tabs (Submissions, Education, Municipalities, Naftali), the Docs panel, and the evidence submission bar.

## Constraints
- **Separation of concerns.** Business logic lives in `business_modules/`. Cross-cutting utilities (persistence, budget/cost tracking, logging, shared helpers) live in `cross-cut-modules/`. The UI lives in `client/`. The Fastify app shell in the repo root (`app.js`, `server.js`) wires these together — it shouldn't contain business logic.
- **Operational safety.** Long-running work must have timeouts and explicit failure signals. Silent partial completion is the worst outcome — prefer loud failure.
- **Artifact-first pipelines.** Stages communicate through files on disk, not in-memory handoffs. This is what makes the pipeline restartable and reviewable.
- **One Node process for both API and SPA.** Fastify serves `client/dist` for non-`/api` routes. This keeps deploys simple at the cost of not being able to scale the two independently — acceptable at the current scale.

## The subsystems

**Ingestion** (`business_modules/{news-sites,whatsapp,audio,video,scheduled_stream_capture,radio}/`) — one module per source, each with an `input/` directory containing CLI entry points and an `output/` or `articles_extracted/` directory where dated markdown exports land. Ingestion modules normalize source-specific quirks into a shared markdown format that downstream stages can parse.

**Storage** (`db/` + SQLite) — default database file `db/app.sqlite` (`SQLITE_PATH`). Raw persistence (evidence, source archive originals, drafts, quotas) lives under `db/persistence/` and `db/source_archive/`; ops CLIs under `db/input/`. RAG chunk indexes use the same SQLite file via `cross-cut-modules/retrieval/`. Only the server writes; stages use these modules rather than opening the DB directly. See [Storage model](storage.md) and the [Module map](module-map.md#top-level-layout) for directory layout.

**Analysis** (`business_modules/resilience_scorer/`) — the scoring pipeline. `extract-signals` reads dated exports and emits typed signals; `assess-signals` applies the weight table and produces reports. Prompts and the taxonomy are kept in this module.

**Cross-cut** (`cross-cut-modules/`) — shared concerns: budget accounting, LLM clients, persistence helpers, and utilities. Anything that *two or more* business modules would otherwise duplicate belongs here.

**Translation** (`business_modules/translation/`) — on-demand translation of the report narrative when the UI language differs from the source language. Called per-request from the UI.

**Domain dashboards** — Education, Municipalities, and Naftali each have their own module under `business_modules/` with their own data and ingestion paths.

**HTTP surface** — Fastify in `app.js` wires routes to the relevant modules. OpenAPI is the contract; see [API reference](../api/index.md). Swagger UI is mounted at `/api/swagger`.

**Frontend** (`client/`) — React + Vite SPA. Tabs for Report, Submissions, Education, Municipalities, Naftali. A Docs panel (in-app) reads `/api/docs/index` and `/api/docs/page/:slug` to render this same product documentation inside the app.

## Examples

### Data flow, high level

```
source adapters ──▶ dated markdown exports ──▶ SQLite evidence ──▶
  ──▶ signals JSON ──▶ assessment report ──▶ API + UI
```

Each arrow crosses a file boundary. Each stage is restartable from the last artifact on disk.

### Where a change usually belongs

- "I want to ingest a new news source." → add an adapter under `business_modules/news-sites/` and teach the homefront extractor about it. Don't touch analysis code.
- "I want to add a new signal type." → update the extraction prompt, the validator, and the scoring weight table in `business_modules/resilience_scorer/`. See [Signal taxonomy](../concepts/signal-taxonomy.md).
- "I want a new tab in the UI." → add a component under `client/src/components/`, wire it into `MainApp.jsx`, and expose the data it needs via a new API route. Don't duplicate analysis logic in the client.
- "I want to rotate an API key." → update the runtime env and restart the server. No rebuilds needed unless it was a `VITE_*` value (then rebuild `client/dist`).

### Operational boundaries

- **Stateless API.** Every request is self-contained; the server doesn't hold per-user session state.
- **Stateful pipeline.** The pipeline writes dated artifacts to disk. That's the state.
- **No shared writers on SQLite.** One server per database file.

## Troubleshooting
- **Reports stop updating**
  - **Check**: ingestion sources, background job exit codes, API keys, and budget caps.
  - **Fix**: verify environment variables and inspect server logs for upstream failures. Start with [Observability](https://docs.vibeswitch.ai/operations/observability).
- **A change to the UI surfaces analysis differently but the numbers are the same**
  - **Check**: is the code in `client/` reshaping data, or is an analysis module changing values?
  - **Fix**: keep analysis in `business_modules/resilience_scorer/`; keep presentation in `client/`. Data mutations in the UI are a code smell.
- **Docs panel doesn't show a page that exists on disk**
  - **Check**: the page's frontmatter (especially `intent` and `gated`) against the in-app panel's user-guide filter.
  - **Fix**: fix frontmatter, or confirm the page appears on [full docs](https://docs.vibeswitch.ai/).

See [Module map](module-map.md) for the "where do I add code?" view, and [Storage model](storage.md) for persistence specifics.
