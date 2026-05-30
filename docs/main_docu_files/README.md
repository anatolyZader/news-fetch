# Main documentation (`main_docu_files`)

Canonical, **overarching** reference documents for this repository. They are kept separate from working notes under `docs/reviews/`, `docs/specs/`, and other ad-hoc files in `docs/`.

## Files in this directory

| File | Role | Start here if… |
|------|------|----------------|
| [pipeline.md](./pipeline.md) | **Operational overview** — multi-source daily pipeline, source toggles, CLI commands, validation, social OSINT, trends tab, file map | You need to run or operate the daily pipeline |
| [8-component-analysis-end-to-end.md](./8-component-analysis-end-to-end.md) | **Implementation reference** — 8 components, ~165 signal types, scoring math, reliability instruments, UI reading guide, QA harness | You need to understand scoring, signals, or change resilience logic |
| [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md) | **Geographic enrichment** — `geo` envelope, district scoping (national + five regional districts), reference data, matching pipeline | You work on locality resolution or regional filters |
| [RAG.md](./RAG.md) | **RAG platform** — unified hybrid retrieval (`rag_chunks`), eight namespaces, five consumption tiers, config, ops, eval | You work on retrieval, indexing, embeddings, or any RAG consumer |
| [LLM_CHAT.md](./LLM_CHAT.md) | **In-app report chat** — sessions, SSE streaming, source archive tools, production RAG (hybrid + Cohere rerank) | You work on chat UX, retrieval, or `POST /api/chat` |
| [AGENTIC_MECHANISMS.md](./AGENTIC_MECHANISMS.md) | **Agent architecture** — shared `runToolLoop`, HITL confirm, validation investigate, tool profiles, observability, non-agent boundaries | You extend or audit LLM agent behavior |

### What each doc covers (current app state, 2026-05-30)

- **RAG.md** — Unified SQLite hybrid RAG platform (`rag_chunks` + FTS5 + OpenAI embeddings + RRF + Cohere rerank): eight namespaces, five consumption tiers (chat, pipeline, analyst, field ops, docs), source archive lifecycle, env/config reference, ops scripts, eval fixtures, May 29–30 recent changes.
- **pipeline.md** — `extract-signals` + `assess-signals` daily pipeline, seven toggled source types in `pipeline-config.json` (including **social** X + Telegram), **pbo_regional** assess-time discovery, **PBO municipal completeness review** (daily step 7b), **WhatsApp DM adaptive chatbot** (group vs DM routing), validation collection, catalog learning gap reports, search trends UI, **News/Radio ingest review tabs**, **multi-district** `DistrictScopeSwitcher` (six scopes), analyst validation review in Report, desktop panel popups (chat, write report, send data, settings), `daily-pipeline.sh`, slash commands (`/8comp-3`, `/8comp-3-north`).
- **8-component-analysis-end-to-end.md** — Full framework depth: multipass extraction, verification, deterministic scoring, epistemic scope partition (including **text-inferred geo exclusion**), data void index, bootstrap/EWMA/polarization/chronic baseline, drift dashboard, narrative grounding, golden corpus, adversarial tests, OOV/learning capture, operator vs analyst display tiers, **ValidationReviewPanel**, full UI/API surface (including video/YouTube evidence and translation). Auto-synced component/facet tables from code.
- **GEOGRAPHIC-ANALYSIS.md** — `IGeoEnrichmentPort`, **v3 nested-only** envelope contract (`geo-envelope-2026-05-v3`), `resolution.provenance`, WhatsApp/survey/news geo attach, **`homefront-district-stubs.json`** for non-north districts, `scopeDecision` vs `geo.scopeDecision`, `regionSignalFilter` + **`signal.district_id`** (legacy north code fallback; no keyword fallback), unknown-locality review sinks.
- **AGENTIC_MECHANISMS.md** — Canonical agent reference: `runToolLoop` tool-use loop (chat + validation investigate), HITL confirm protocol (`propose_*` + `POST /api/chat/confirm-action`), tool profiles (`default` / `validation` / `sources`), validation multi-turn UX, audit `agent.tool_round`, and explicit boundaries vs one-shot LLM and batch pipeline.

Operator-facing instruments and feature flags are summarized in [`docs/MODEL-CARD.md`](../MODEL-CARD.md) (companion to the 8-component doc, not duplicated here).

## Auto-sync

Sections marked with `<!-- docs-sync:BEGIN … -->` / `<!-- docs-sync:END … -->` in **8-component-analysis-end-to-end.md** are regenerated from code (`resilienceComponents.js`, `componentFacets.js`, UI translations) on every CI run and via:

```bash
npm run docs:sync
```

Do not hand-edit content between those markers. Edit the source modules instead.

API reference pages under `docs/product_docs/api/generated/` are regenerated from `openapi/openapi.yaml` as part of the same sync. The spec includes **SocialMedia** (7 routes) and **SearchTrends** (3 routes) tags alongside existing modules.
