# RAG platform

**Purpose:** Unified **hybrid retrieval** (SQLite `rag_chunks`, FTS5, optional embeddings, RRF, Cohere rerank) feeding chat, pipeline extract, report-build, analyst tools, and docs search.

**Sources:** `cross-cut-modules/retrieval/`, `createRetrievalService.js`, `ragConfig.js`.

---

## Architecture

```text
Index writers → rag_chunks (namespace, parent_id, date, body)
  → chunkStore + FTS rebuild
  → retrievalService.hybridRetrieve(query, { namespaces, date window, topK })
  → Consumers (chat, extract, field report-build, docs panel, translation, …)
```

**Factory:** `createRetrievalService({ dbPath })` wires store, orchestrator, and specialized index writers.

**Toggle:** `RAG_PIPELINE_ENABLED=0` disables pipeline-side RAG; per-feature flags in `ragConfig.js` (`CHAT_RAG_ENABLED`, `REPORT_BUILD_RAG_ENABLED`, `DOCS_RAG_ENABLED`, etc.).

---

## Namespaces

| Namespace | Writer | Content | Reindex npm |
|-----------|--------|---------|-------------|
| `archive` | `indexWriter.js` | Source archive rows | `npm run rag:reindex` |
| `report` | `indexWriter.js` | Assessment report chunks | (with archive / assess) |
| `catalog` | `catalogIndexWriter.js` | Signal catalog | `npm run rag:reindex-catalog` |
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
| Chat | `business_modules/chat/` — `sourceArchiveQuery.js`, tool handlers | Hybrid search over archive + tools |
| Pipeline extract | `pipelineRetrieval.js` | Prompt span selection when extract RAG enabled |
| Report build | `fieldRetrieval.js` | Similar reports, taxonomy, HFC snippets |
| Analyst | `analystRetrieval.js` | Validation explain/agent context; catalog gap neighbors for signal catalog evolution |
| Docs panel | `docsRetrieval.js` | `GET /api/docs/search` |
| Translation | `translationTermRetrieval.js` | Glossary-aware translation |

---

## Reindex operations

All reindex CLIs: open `createRetrievalService`, run writer, `rebuildFts()`, close.

```bash
npm run rag:reindex              # archive (--days window in script)
npm run rag:reindex-docs
npm run rag:reindex-hfc
npm run rag:reindex-catalog
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
| `SIGNAL_CATALOG_EVOLUTION_RAG_ENABLED` | Gap-report nearest-catalog neighbors (`retrieveCatalogNeighbors`) |

See `ragConfig.js` for topK, snippet length, date windows.

---

## Signal catalog evolution (gap reports)

**Module:** `business_modules/signal_catalog_evolution/`  
**Gap CLI:** `npm run signal-catalog-evolution:gap-report`  
**Catalog index:** `npm run rag:reindex-catalog` (namespace `catalog`)

Clusters OOV captures from `daily_reports/oov-capture-*.jsonl`, optionally enriches clusters with nearest existing catalog types via `retrieveCatalogNeighbors`. Analyst draft proposals: `GET/POST /api/signal-catalog-evolution/proposals*`.

---

## Related docs

- Guided report (web + WhatsApp DM): [PIPELINE-AND-SOURCES.md § Guided report](./PIPELINE-AND-SOURCES.md#guided-report-write-report--whatsapp-dm)
- Chat tools using RAG: [LLM-CHAT-AND-AGENTS.md](./LLM-CHAT-AND-AGENTS.md)
- HFC guidelines in report-build: [PIPELINE-AND-SOURCES.md](./PIPELINE-AND-SOURCES.md)
- Docs HTTP budget: [COST-CONTROLS.md](./COST-CONTROLS.md)
