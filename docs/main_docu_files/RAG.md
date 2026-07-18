# RAG platform

**Purpose:** Unified **hybrid retrieval** (SQLite `rag_chunks`, FTS5, optional embeddings, RRF, Cohere rerank) feeding **assess-time investigation**, chat, pipeline extract, report-build, analyst tools, and docs search.

**Sources:** `cross-cut-modules/retrieval/`, `createRetrievalService.js`, `ragConfig.js`, `componentRagSeeding.js`, `evidenceGraph.js`.

---

## Architecture

```text
Index writers → rag_chunks (namespace, parent_id, date, body)
  → chunkStore + FTS rebuild
  → retrievalService.hybridRetrieve(query, { namespaces, date window, topK })
  → Consumers (assess agent, chat, extract, field report-build, docs panel, translation, …)
```

**Factory:** `createRetrievalService({ dbPath })` wires store, orchestrator, and specialized index writers.

**Toggle:** `RAG_PIPELINE_ENABLED=0` disables pipeline-side RAG; per-feature flags in `ragConfig.js` (`CHAT_RAG_ENABLED`, `REPORT_BUILD_RAG_ENABLED`, `DOCS_RAG_ENABLED`, etc.).

---

## Namespaces

| Namespace | Writer | Content | Reindex npm |
|-----------|--------|---------|-------------|
| `archive` | `indexWriter.js` | Source archive rows | `npm run rag:reindex` |
| `report` | `indexWriter.js` | Assessment report chunks | (with archive / assess) |
| `catalog` | `catalogIndexWriter.js` | Signal catalog | — (dedicated reindex CLI retired with `signal_catalog_evolution`; writer wiring remains in `createRetrievalService.js`) |
| `field_examples` | `fieldExamplesIndexWriter.js` | Approved field taxonomy | `npm run rag:reindex-field-examples` |
| `hfc` | `hfcGuidelinesIndexWriter.js` | HFC field guidelines MD | `npm run rag:reindex-hfc` |
| `social_examples` | `socialExamplesIndexWriter.js` | Social OSINT examples | `npm run rag:reindex-social-examples` |
| `docs` | `docsIndexWriter.js` | Product pages | `npm run rag:reindex-docs` |
| `terms` | `translationGlossaryIndexWriter.js` | Translation glossary | `npm run rag:reindex-terms` |

**HFC corpus path:** `business_modules/report_build/data/hfc-field-guidelines.md`  
**Docs pages path:** `cross-cut-modules/docs/content/pages/` (override: `DOCS_ROOT` env)

Static index dates: docs namespace uses `2099-01-01`; HFC uses `2099-01-01`.

---

## Consumption tiers

| Tier | Module | Use |
|------|--------|-----|
| **Assess agent** | `componentRagSeeding.js`, `evidenceGraph.js`, `multiHopRetrieval.js` | Per-component RAG seed at assess; evidence graph claims; specialist tool loop (`search_sources`, `get_source`) |
| Chat | `business_modules/chat/` — `sourceArchiveQuery.js`, `chatRetrievalCache.js`, tool handlers | Hybrid search over archive + tools; session-scoped dedup via `CHAT_RETRIEVAL_CACHE_TTL_MS` (see [COST-CONTROLS.md](./COST-CONTROLS.md)); span `sqlite.hybrid_retrieve` when `OTEL_ENABLED` |
| Pipeline extract | `pipelineRetrieval.js` | Prompt span selection when extract RAG enabled |
| Report build | `fieldRetrieval.js` | Similar reports, taxonomy, HFC snippets |
| PBO review | `analystRetrieval.js` (`retrievePboHistory`) | Historical PBO context for `pbo_report_review`; the earlier validation-explain and catalog-gap-neighbor retrieval this file supported has been removed |
| Docs panel | `docsRetrieval.js` | `GET /api/docs/search` |
| Translation | `translationTermRetrieval.js` | Glossary-aware translation |

### Assess-time RAG (default assess path)

When the assessment agent is **not** skipped (`shouldSkipAssessmentAgent` in `agentConfig.js` — set `RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC=1` to skip; `RESILIENCE_ASSESSMENT_AGENT=0` is **deprecated**, same effect):

1. **Planner (signals-only)** — `buildPlannerContext` runs without upfront RAG when `RESILIENCE_ASSESS_LAZY_RAG=1` (default).
2. **Lazy component seed** — `seedComponentRagForComponents` retrieves only for `plan.focus_components` (`topKPerComponent` default **3**).
3. **Global retrieve** — hybrid retrieve with `RESILIENCE_ASSESS_GLOBAL_TOPK` (default **8**); on by default via `RESILIENCE_ASSESS_GLOBAL_RAG` (default on; set `=0` to disable).
4. **`buildEvidenceGraph`** — merges catalog signals, RAG hits, OOV/residual observations, gaps; optional archive epistemic hints (`RESILIENCE_ASSESS_ARCHIVE_EPISTEMIC`).
5. **Specialist tools** — `multiHopRetrieval.js` extends context within budget; contested components may run adversarial retrieval (`RESILIENCE_ASSESS_CONTESTED_ADVERSARIAL`).

Disable all component seeding: `RESILIENCE_ASSESS_OPEN_RAG=0`.

Legacy upfront seed (all 8 components before planner): set `RESILIENCE_ASSESS_LAZY_RAG=0`.

See [RESILIENCE-ENGINE-REFERENCE.md §3.1](./RESILIENCE-ENGINE-REFERENCE.md#31-assessment-agent-v2) and [MODEL-CARD.md](../MODEL-CARD.md) for Tier 1/2 flags.

---

## Reindex operations

All reindex CLIs: open `createRetrievalService`, run writer, `rebuildFts()`, close.

```bash
npm run rag:reindex              # archive (--days window in script)
npm run rag:reindex-docs
npm run rag:reindex-hfc
npm run rag:reindex-field-examples
npm run rag:reindex-social-examples
npm run rag:reindex-terms
npm run rag:eval                 # eval harness: db/input/ragEval.js
```

After deploy or bulk doc changes: run relevant reindex + restart if needed.

---

## Config (selected env)

| Variable | Role |
|----------|------|
| `RAG_PIPELINE_ENABLED` | Master pipeline RAG |
| `CHAT_RAG_ENABLED` | Chat retrieval |
| `REPORT_BUILD_RAG_ENABLED` | Field report-build context |
| `DOCS_RAG_ENABLED` | Docs panel search |
| `VECTOR_INDEX_EMBEDDINGS` | Embedding index (0 = FTS-only tests) |
| `COHERE_API_KEY` | Rerank when enabled |
| `DOCS_RAG_VERSION` / package version | Docs corpus scope id |
| `RESILIENCE_ASSESS_LAZY_RAG` | Lazy component RAG after planner (default on) |
| `RESILIENCE_ASSESS_GLOBAL_RAG` | Global hybrid retrieve at assess (default on) |
| `RESILIENCE_ASSESS_GLOBAL_TOPK` | Global retrieve top-K (default 8) |
| `RESILIENCE_ASSESS_OPEN_RAG` | Per-component RAG seeding (default on; `0` disables) |
| `RESILIENCE_EXTRACT_RAG_ENABLED` | Prompt-span RAG during pipeline extract |

See `ragConfig.js` for topK, snippet length, date windows.

---

## Related docs

- Guided report (web + WhatsApp DM): [PIPELINE-AND-SOURCES.md § Guided report](./PIPELINE-AND-SOURCES.md#guided-report-write-report--whatsapp-dm)
- Chat tools using RAG: [LLM-CHAT-AND-AGENTS.md](./LLM-CHAT-AND-AGENTS.md)
- HFC guidelines in report-build: [PIPELINE-AND-SOURCES.md](./PIPELINE-AND-SOURCES.md)
- Docs HTTP budget: [COST-CONTROLS.md](./COST-CONTROLS.md)
