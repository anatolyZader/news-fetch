/**
 * Assemble retrieval hits and signals into an evidence graph for agent reasoning.
 */
import { buildSignalRefRegistry } from '../../business_modules/resilience/domain/services/narrativeGrounding/signalRefRegistry.js';
import { SIGNAL_TO_COMPONENTS } from '../../business_modules/resilience/domain/services/signalRouter.js';
import { COMPONENT_IDS } from '../resilience-contracts/componentIds.js';

const OOV_CLUSTER_CAP = 3;
const RAG_SEED_CLAIM_CAP = 3;
const THIN_ARTICLE_THRESHOLD = 5;

export function oovGraphEnabled() {
  const v = process.env.RESILIENCE_ASSESS_OOV_GRAPH;
  return v == null || v === '' || v === '1' || v === 'true';
}

/**
 * @param {string} gapText
 * @param {string} compId
 */
export function classifyGap(gapText, compId) {
  const text = String(gapText ?? '');
  let gap_type = 'investigation';
  if (text.includes('need more corroborating')) gap_type = 'data';
  const slug = text.slice(0, 40).replace(/\W+/g, '_').toLowerCase();
  return {
    gap_id: `${compId}:${slug}`,
    component_id: compId,
    gap_type,
    gap_text: text,
  };
}

/**
 * @param {string} compId
 * @param {object} profile
 * @param {object[]} claims
 */
export function buildRetrievalGaps(compId, profile, claims) {
  const gaps = [];
  if (profile.thin_evidence) gaps.push(`need more corroborating evidence for ${compId}`);
  if (profile.contested && claims.length < 2) gaps.push(`need opposing evidence for contested ${compId}`);
  for (const w of profile.dominance_warnings ?? []) {
    gaps.push(`diversify sources: ${w.message}`);
  }
  return gaps;
}

/**
 * @param {Record<string, string[]>} gapsByComponent
 */
export function buildClassifiedGapsForPlanner(gapsByComponent) {
  const out = [];
  for (const [compId, gaps] of Object.entries(gapsByComponent ?? {})) {
    for (const g of gaps ?? []) {
      out.push(classifyGap(g, compId));
    }
  }
  return out;
}

/**
 * @param {object[]} hits — hybridRetrieve results
 * @param {object[]} signals
 * @param {object} epistemicProfile
 * @param {Record<string, object>} [scoredLike] — optional legacy scored map for registry
 * @param {object} [oovBurst]
 * @param {number} [totalArticles]
 */
export function buildEvidenceGraph({
  hits = [],
  signals = [],
  epistemicProfile,
  scoredLike = null,
  oovBurst = null,
  totalArticles = 0,
}) {
  const registry = scoredLike
    ? buildSignalRefRegistry(scoredLike)
    : buildSignalRefRegistryFromSignals(signals);

  const nodes = {
    sources: [],
    chunks: [],
    signals: [],
    hypotheses: [],
    oov_clusters: [],
  };
  const edges = [];

  const sourceIds = new Set();
  for (const h of hits) {
    nodes.chunks.push({
      id: h.chunkId ?? h.parentId,
      parent_id: h.parentId,
      text: String(h.text ?? '').slice(0, 500),
      source_type: h.sourceType ?? h.source_type ?? null,
      title: h.title ?? null,
      seed_origin: h.seed_origin ?? null,
      component_id: h.component_id ?? null,
    });
    if (h.parentId && !sourceIds.has(h.parentId)) {
      sourceIds.add(h.parentId);
      nodes.sources.push({
        id: h.parentId,
        source_type: h.sourceType ?? h.source_type ?? null,
        title: h.title ?? null,
      });
      edges.push({ from: h.parentId, to: h.chunkId ?? h.parentId, type: 'published' });
    }
  }

  for (const s of signals ?? []) {
    const ref = registry.byRef ? [...registry.byRef.entries()].find(([, v]) => v.signal === s)?.[0] : null;
    const refKey = ref ?? buildRefFromSignal(s);
    nodes.signals.push({
      id: refKey,
      signal_type: s.signal_type ?? s.type,
      source_type: s.source_type,
      evidence: String(s.evidence ?? '').slice(0, 300),
      grounding_tier: s.grounding_tier ?? null,
    });
    const articleKey = s.article_url ?? s.source_id ?? null;
    if (articleKey) {
      edges.push({ from: refKey, to: articleKey, type: 'grounded_in' });
    }
    for (const compId of COMPONENT_IDS) {
      if (signalMapsToComponent(s, compId)) {
        edges.push({ from: refKey, to: compId, type: 'maps_to_component' });
      }
    }
  }

  const oovClaimsByComponent = injectOovClusters(nodes, oovBurst);

  const byComponent = {};
  for (const compId of COMPONENT_IDS) {
    const compProfile = epistemicProfile?.by_component?.[compId] ?? {};
    const compSignals = (signals ?? []).filter((s) => signalMapsToComponent(s, compId));
    const compHits = hits.filter((h) => !h.component_id || h.component_id === compId);
    const claims = buildClaimsForComponent(
      compId,
      compSignals,
      compHits.length ? compHits : hits,
      compProfile,
      registry,
      totalArticles,
    );
    const oovClaims = oovClaimsByComponent[compId] ?? [];
    const mergedClaims = [...claims, ...oovClaims];
    const retrieval_gaps = buildRetrievalGaps(compId, compProfile, mergedClaims);

    nodes.hypotheses.push({ id: `hyp:${compId}`, component_id: compId });
    byComponent[compId] = {
      component_id: compId,
      claims: mergedClaims,
      retrieval_gaps,
      epistemic_flags: buildEpistemicFlags(compProfile),
    };
  }

  return {
    nodes,
    edges,
    by_component: byComponent,
    registry_ref_count: registry.refCount ?? 0,
    oov_cluster_count: nodes.oov_clusters.length,
  };
}

function injectOovClusters(nodes, oovBurst) {
  const byComponent = Object.fromEntries(COMPONENT_IDS.map((id) => [id, []]));
  if (!oovGraphEnabled()) return byComponent;
  if (!oovBurst?.alert && (oovBurst?.top_cluster_count ?? 0) < 3) return byComponent;

  const clusters = (oovBurst?.top_clusters ?? []).slice(0, OOV_CLUSTER_CAP);
  if (!clusters.length && oovBurst?.top_cluster_key) {
    clusters.push({
      cluster_key: oovBurst.top_cluster_key,
      count: oovBurst.top_cluster_count ?? 0,
      keywords: oovBurst.top_cluster_keywords ?? [],
      sample_evidence: (oovBurst.top_cluster_keywords ?? []).join(', '),
    });
  }

  for (const cluster of clusters) {
    const clusterKey = cluster.cluster_key ?? cluster.key ?? 'unknown';
    const keywords = cluster.keywords ?? cluster.top_keywords ?? [];
    const sample = String(cluster.sample_evidence ?? keywords.slice(0, 5).join(', ')).slice(0, 200);
    nodes.oov_clusters.push({
      id: `oov:${clusterKey}`,
      cluster_key: clusterKey,
      count: cluster.count ?? 0,
      keywords: keywords.slice(0, 8),
      sample_evidence: sample,
      epistemic_status: 'unverified',
    });

    const targetComp = mapOovToComponent(keywords, sample);
    byComponent[targetComp].push({
      claim_id: `${targetComp}:oov_${clusterKey}`,
      text: `Unclassified repeated phrasing: ${sample || clusterKey}`,
      support: [{ ref: `oov:${clusterKey}`, mass: 0.15 }],
      contradict: [],
      epistemic_flags: ['unverified', 'oov_cluster'],
    });
  }

  return byComponent;
}

function mapOovToComponent(keywords, sample) {
  const text = `${keywords.join(' ')} ${sample}`.toLowerCase();
  const hints = [
    ['information_communication', ['media', 'message', 'alert', 'communication', 'news']],
    ['leadership', ['mayor', 'municipal', 'government', 'leadership', 'coordination']],
    ['wellbeing_at_risk', ['mental', 'trauma', 'anxiety', 'wellbeing', 'stress']],
    ['lifesaving_behavior', ['shelter', 'safety', 'emergency', 'evacuat']],
    ['functional_continuity', ['service', 'infrastructure', 'continuity', 'supply']],
  ];
  for (const [compId, terms] of hints) {
    if (terms.some((t) => text.includes(t))) return compId;
  }
  return 'narrative';
}

function buildSignalRefRegistryFromSignals(signals) {
  const pseudo = {};
  for (const compId of COMPONENT_IDS) {
    pseudo[compId] = { signals: (signals ?? []).filter((s) => signalMapsToComponent(s, compId)) };
  }
  return buildSignalRefRegistry(pseudo);
}

function buildRefFromSignal(s) {
  const t = s.signal_type ?? s.type ?? 'unknown';
  const k = s.article_url ?? s.article_index ?? 'na';
  return `${t}@${k}`;
}

function signalMapsToComponent(signal, compId) {
  const t = signal.signal_type ?? signal.type;
  if (!t) return false;
  return compId in (SIGNAL_TO_COMPONENTS[t] ?? {});
}

function buildClaimsForComponent(compId, compSignals, hits, profile, registry, totalArticles) {
  const claims = [];
  let idx = 0;
  for (const s of compSignals.slice(0, 8)) {
    const ref = [...(registry.byRef?.entries() ?? [])].find(([, v]) => v.signal === s)?.[0]
      ?? buildRefFromSignal(s);
    const polarity = s.polarity_override === 'negative' ? 'weaken' : 'support';
    claims.push({
      claim_id: `${compId}:c${idx += 1}`,
      text: String(s.evidence ?? s.description ?? '').slice(0, 280) || `${s.signal_type ?? s.type} signal`,
      support: polarity === 'support' ? [{ ref, mass: 0.3 }] : [],
      contradict: polarity === 'weaken' ? [{ ref, mass: 0.3 }] : [],
      epistemic_flags: profile.contested ? ['contested'] : [],
    });
  }

  const ragHits = hits
    .filter((h) => h.seed_origin === 'component_rag' && (!h.component_id || h.component_id === compId))
    .slice(0, RAG_SEED_CLAIM_CAP);

  for (const h of ragHits) {
    const flags = ['rag_seed'];
    if (profile.thin_evidence) flags.push('thin_evidence');
    const mass = profile.thin_evidence ? 0.2 : 0.25;
    claims.push({
      claim_id: `${compId}:r${idx += 1}`,
      text: String(h.text ?? '').slice(0, 200),
      support: [{ ref: h.parentId ?? h.chunkId, mass }],
      contradict: [],
      epistemic_flags: flags,
    });
  }

  const skipRagOnlyFallback = profile.thin_evidence && totalArticles < THIN_ARTICLE_THRESHOLD;
  if (claims.length === 0 && hits.length > 0 && !skipRagOnlyFallback) {
    const h = hits[0];
    claims.push({
      claim_id: `${compId}:c1`,
      text: String(h.text ?? '').slice(0, 200),
      support: [{ ref: h.parentId ?? h.chunkId, mass: 0.2 }],
      contradict: [],
      epistemic_flags: profile.thin_evidence ? ['thin_evidence', 'rag_seed'] : ['rag_seed'],
    });
  }
  if ((profile.dominance_warnings ?? []).length > 0 && claims[0]) {
    claims[0].epistemic_flags.push('single_source_dominance');
  }
  return claims;
}

function buildEpistemicFlags(profile) {
  const flags = [];
  if (profile.thin_evidence) flags.push('thin_evidence');
  if (profile.contested) flags.push('contested');
  if ((profile.dominance_warnings ?? []).length) flags.push('dominance_warning');
  if (profile.delta_significance?.startsWith('HIGH')) flags.push('significant_delta');
  return flags;
}

/**
 * Convert component graph to evidence_tree UI shape.
 */
export function evidenceTreeFromGraph(componentGraph) {
  if (!componentGraph?.claims) return [];
  return componentGraph.claims.map((c) => ({
    claim_id: c.claim_id,
    text: c.text,
    support: c.support ?? [],
    contradict: c.contradict ?? [],
    flags: c.epistemic_flags ?? [],
  }));
}
