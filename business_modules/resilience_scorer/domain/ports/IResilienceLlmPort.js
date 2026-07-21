/**
 * Abstracts LLM-backed signal extraction for resilience pipeline stages.
 *
 * Pipeline position: EXTRACT stage — invoked by extraction services and sibling
 * modules (whatsapp, specialist_agents) that need catalogue/open signal parsing.
 *
 * Owns: contract surface (methods/typedefs below).
 * Does NOT: implement adapters (those live in infrastructure/).
 *
 * Key collaborators: resilienceLlmCapability, anthropicResilienceLlmAdapter,
 * resilienceAnalysisService, assessmentOrchestrator (specialist_agents).
 */

/**
 * Minimal LLM capability surface for resilience signal extraction.
 *
 * @typedef {object} IResilienceLlmPort
 * @property {(articles: object[], opts?: object) => Promise<object[]>} extractSignals
 * Run structured signal extraction over a batch of source articles/documents.
 * Returns parsed signal instances (catalogue-mapped or open-vocabulary) ready for
 * downstream validation and geo enrichment. Optional `opts` carry prompt overrides,
 * model hints, or source-type context for the adapter.
 */

export {};
