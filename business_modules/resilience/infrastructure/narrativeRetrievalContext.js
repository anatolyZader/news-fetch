/**
 * Narrative-stage RAG grounding from archive chunks.
 */
import {
  retrieveNarrativeGrounding,
  formatRetrievedSpansBlock,
} from '../../../cross-cut-modules/retrieval/pipelineRetrieval.js';
import { resilienceNarrativeRagEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';
import { buildSignalRefRegistry } from '../domain/services/narrativeGrounding/index.js';

/**
 * @param {Record<string, object>} scoredComponents
 * @param {{ retrievalService?: object|null, reportDate?: string }} [opts]
 * @returns {Promise<{ spansByComponent: object, block: string }>}
 */
export async function buildNarrativeRetrievalContext(scoredComponents, opts = {}) {
  if (!resilienceNarrativeRagEnabled()) {
    return { spansByComponent: {}, block: '' };
  }
  const retrieval = opts.retrievalService?.retrieval;
  if (!retrieval?.hybridRetrieve) {
    return { spansByComponent: {}, block: '' };
  }
  const registry = buildSignalRefRegistry(scoredComponents);
  const spansByComponent = await retrieveNarrativeGrounding({
    scoredComponents,
    registry,
    reportDate: opts.reportDate,
    retrieval,
  });
  const block = formatRetrievedSpansBlock(spansByComponent);
  return { spansByComponent, block };
}
