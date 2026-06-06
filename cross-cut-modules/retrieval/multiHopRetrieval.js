/**
 * Multi-hop retrieval helpers governed by epistemic retrieval policies.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  executeAssessmentEvidenceTool,
  LOOKUP_TOOL_NAMES,
  MULTI_HOP_TOOL_NAMES,
} from './assessmentEvidenceTools.js';
import { buildEvidenceGraph } from './evidenceGraph.js';
import { applyRetrievalPolicies } from './retrievalPolicies.js';

export { applyRetrievalPolicies } from './retrievalPolicies.js';

/**
 * @param {object} deps
 * @param {object} deps.retrieval — hybridRetrieve
 * @param {object} [deps.chunkStore]
 * @param {string} [deps.reportsDir]
 */
export function createMultiHopRetrieval(deps) {
  const retrieval = deps.retrieval;
  const reportsDir = deps.reportsDir ?? 'daily_reports';

  async function hybrid(query, filters = {}) {
    if (!retrieval?.hybridRetrieve) return [];
    const hits = await retrieval.hybridRetrieve(query, filters);
    if (filters.epistemicProfile) {
      return applyRetrievalPolicies(hits, filters.epistemicProfile);
    }
    return hits;
  }

  return {
    async retrieveForClaim({ claim_text, component_id, polarity = 'both', epistemicProfile, reportDate }) {
      const q = `${component_id ?? ''} ${claim_text}`.trim();
      const support = await hybrid(q, {
        namespaces: ['archive', 'report'],
        reportDate,
        epistemicProfile,
        topKFinal: 8,
      });
      let contradict = [];
      if (polarity === 'both' || polarity === 'contradict') {
        contradict = await hybrid(`contradicting opposing ${q}`, {
          namespaces: ['archive'],
          reportDate,
          epistemicProfile,
          topKFinal: 5,
        });
      }
      return { support, contradict };
    },

    async expandSourceNeighborhood({ source_id, top_k = 10, reportDate }) {
      const q = String(source_id);
      return hybrid(q, {
        namespaces: ['archive'],
        reportDate,
        topKFinal: top_k,
        parentId: source_id,
      });
    },

    async crossSourceCompare({ topic, source_types = [], component_id, reportDate, epistemicProfile }) {
      const out = {};
      for (const st of source_types) {
        out[st] = await hybrid(`${topic} ${component_id ?? ''}`.trim(), {
          namespaces: ['archive'],
          reportDate,
          epistemicProfile,
          sourceType: st,
          topKFinal: 6,
        });
      }
      return out;
    },

    async temporalTrace({ entity, window_days = 14, component_id, reportDate }) {
      return hybrid(`${entity} ${component_id ?? ''}`.trim(), {
        namespaces: ['archive', 'report'],
        reportDate,
        dateWindowDays: window_days,
        topKFinal: 12,
      });
    },

    recallPriorAssessments({ component_id, window_days = 14, reportDate }) {
      if (!existsSync(reportsDir)) return [];
      const files = readdirSync(reportsDir).filter((f) => f.startsWith('resilience-report-') && f.endsWith('.json'));
      const results = [];
      for (const f of files.slice(-window_days * 2)) {
        try {
          const parsed = JSON.parse(readFileSync(join(reportsDir, f), 'utf8'));
          const comp = (parsed.assessment?.components ?? []).find((c) => c.component_id === component_id);
          if (comp) {
            results.push({
              date: parsed.assessment?.date,
              severity: comp.severity ?? null,
              narrative_excerpt: String(comp.narrative ?? '').slice(0, 200),
              schema_version: parsed.assessment?.schema_version ?? '1.0',
            });
          }
        } catch {
          // skip corrupt files
        }
      }
      return results.filter((r) => r.date && r.date !== reportDate).slice(-window_days);
    },

    buildGraphFromHits(hits, signals, epistemicProfile) {
      return buildEvidenceGraph({ hits, signals, epistemicProfile });
    },
  };
}

/**
 * Execute multi-hop assessment tools.
 */
export async function executeMultiHopTool(name, input, ctx) {
  const multiHop = ctx.multiHop;
  if (!multiHop) return JSON.stringify({ error: 'multi_hop_not_configured' });

  switch (name) {
    case 'retrieve_for_claim':
      return JSON.stringify(await multiHop.retrieveForClaim({
        claim_text: input.claim_text,
        component_id: input.component_id,
        polarity: input.polarity,
        epistemicProfile: ctx.epistemicProfile,
        reportDate: ctx.reportDate,
      }));
    case 'expand_source_neighborhood':
      return JSON.stringify(await multiHop.expandSourceNeighborhood({
        source_id: input.source_id,
        top_k: input.top_k,
        reportDate: ctx.reportDate,
      }));
    case 'cross_source_compare':
      return JSON.stringify(await multiHop.crossSourceCompare({
        topic: input.topic,
        source_types: input.source_types,
        component_id: input.component_id,
        reportDate: ctx.reportDate,
        epistemicProfile: ctx.epistemicProfile,
      }));
    case 'temporal_trace':
      return JSON.stringify(await multiHop.temporalTrace({
        entity: input.entity,
        window_days: input.window_days,
        component_id: input.component_id,
        reportDate: ctx.reportDate,
      }));
    case 'recall_prior_assessments':
      return JSON.stringify(multiHop.recallPriorAssessments({
        component_id: input.component_id,
        window_days: input.window_days,
        reportDate: ctx.reportDate,
      }));
    case 'get_epistemic_profile': {
      const compId = input.component_id;
      const profile = ctx.epistemicProfile;
      if (!profile) return JSON.stringify({ error: 'no_profile' });
      if (compId) return JSON.stringify(profile.by_component?.[compId] ?? {});
      return JSON.stringify(profile);
    }
    default:
      if (LOOKUP_TOOL_NAMES.has(name)) {
        return executeAssessmentEvidenceTool(name, input, ctx);
      }
      return JSON.stringify({ error: `unknown_tool:${name}` });
  }
}

export { MULTI_HOP_TOOL_NAMES, LOOKUP_TOOL_NAMES };
