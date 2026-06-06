/**
 * Per-component RAG seeding for assessment evidence graph bootstrap.
 */
import { COMPONENT_IDS } from '../resilience-contracts/componentIds.js';
import { applyRetrievalPolicies } from './retrievalPolicies.js';

const COMPONENT_RAG_QUERIES = Object.freeze({
  narrative: 'narrative messaging public discourse resilience community',
  information_communication: 'information communication media messaging alerts',
  lifesaving_behavior: 'lifesaving behavior shelter safety emergency response',
  functional_continuity: 'functional continuity services infrastructure municipal',
  community_capital: 'community capital mutual aid volunteering resilience',
  leadership: 'leadership municipal coordination government response',
  belonging_solidarity: 'belonging solidarity social cohesion community trust',
  wellbeing_at_risk: 'wellbeing mental health trauma vulnerable populations',
});

export function componentRagSeedingEnabled() {
  const v = process.env.RESILIENCE_ASSESS_OPEN_RAG;
  return v == null || v === '' || v === '1' || v === 'true';
}

export function shouldSkipComponentRagSeed({ assessmentMode, epistemicStatus }) {
  if (assessmentMode === 'abstained') return true;
  if (epistemicStatus?.sampling_status === 'blind') return true;
  return false;
}

/**
 * Collect parent IDs already represented in signals for dedup.
 * @param {object[]} signals
 */
export function signalParentIds(signals = []) {
  const ids = new Set();
  for (const s of signals) {
    if (s.article_url) ids.add(String(s.article_url));
    if (s.source_id) ids.add(String(s.source_id));
  }
  return ids;
}

/**
 * Dedupe hits by parentId / chunkId.
 * @param {object[]} hitLists
 */
export function dedupeHits(hitLists) {
  const seen = new Set();
  const out = [];
  for (const h of hitLists.flat()) {
    const key = h.parentId ?? h.chunkId ?? h.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

/**
 * @param {object} params
 */
export async function seedComponentRagHits(params) {
  const {
    retrieval,
    reportDate,
    scopeId = null,
    epistemicProfile,
    focusComponents = COMPONENT_IDS,
    signals = [],
    topKPerComponent = 5,
    assessmentMode = 'normal',
    epistemicStatus = null,
  } = params;

  if (!componentRagSeedingEnabled()) return [];
  if (!retrieval?.hybridRetrieve) return [];
  if (shouldSkipComponentRagSeed({ assessmentMode, epistemicStatus })) return [];

  const existingParents = signalParentIds(signals);
  const components = focusComponents.length ? focusComponents : COMPONENT_IDS;

  const fetches = components.map(async (compId) => {
    const query = COMPONENT_RAG_QUERIES[compId] ?? `${compId} resilience`;
    let hits = await retrieval.hybridRetrieve(query, {
      namespaces: ['archive', 'report'],
      reportDate,
      scopeId: scopeId === 'national' ? null : scopeId,
      epistemicProfile,
      topKFinal: topKPerComponent,
    });
    if (epistemicProfile) {
      hits = applyRetrievalPolicies(hits, epistemicProfile);
    }
    return hits
      .filter((h) => {
        const pid = h.parentId ?? h.chunkId;
        return pid && !existingParents.has(String(pid));
      })
      .map((h) => ({
        ...h,
        seed_origin: 'component_rag',
        component_id: compId,
      }));
  });

  const nested = await Promise.all(fetches);
  return nested.flat();
}

export { COMPONENT_RAG_QUERIES };
