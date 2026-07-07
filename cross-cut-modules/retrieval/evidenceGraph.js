/**
 * Assemble retrieval hits and signals into an evidence graph for agent reasoning.
 */
import { buildSignalRefRegistry, SIGNAL_TO_COMPONENTS } from '../../business_modules/resilience_scorer/index.js';
import { COMPONENT_IDS } from '../resilience-contracts/componentIds.js';
import { mapObservationToComponent, observationText } from './residualObservations.js';

const OOV_CLUSTER_CAP = 3;
const RAG_SEED_CLAIM_CAP = 3;
const THIN_ARTICLE_THRESHOLD = 5;

function openObsGraphCap() {
  const n = Number.parseInt(process.env.RESILIENCE_OPEN_OBS_GRAPH_CAP ?? '20', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 20;
}

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
  const slug = text.slice(0, 40).replaceAll(/\W+/g, '_').toLowerCase();
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
  // Emit at most one normalized dominance gap per (layer, key). The raw warning
  // message embeds a volatile mass-share percentage, which differs per component
  // and defeats the synthesizer's cross-component de-dup — flooding the gap list
  // with the same systemic single-source problem. Dropping the percentage lets a
  // single canonical caveat surface once at report level.
  const seenDominance = new Set();
  for (const w of profile.dominance_warnings ?? []) {
    const key = `${w.layer}:${w.key}`;
    if (seenDominance.has(key)) continue;
    seenDominance.add(key);
    gaps.push(`diversify sources: ${w.layer} "${w.key}" over-represented`);
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
function addHitNodes(hits, nodes, edges, sourceIds) {
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
}

function addSignalNodes(signals, registry, nodes, edges) {
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
}

function buildComponentHypotheses({
  hits,
  signals,
  epistemicProfile,
  registry,
  totalArticles,
  nodes,
  oovClaimsByComponent,
  openClaimsByComponent,
  residualClaimsByComponent,
}) {
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
    const mergedClaims = [
      ...claims,
      ...(oovClaimsByComponent[compId] ?? []),
      ...(openClaimsByComponent[compId] ?? []),
      ...(residualClaimsByComponent[compId] ?? []),
    ];
    nodes.hypotheses.push({ id: `hyp:${compId}`, component_id: compId });
    byComponent[compId] = {
      component_id: compId,
      claims: mergedClaims,
      retrieval_gaps: buildRetrievalGaps(compId, compProfile, mergedClaims),
      epistemic_flags: buildEpistemicFlags(compProfile),
    };
  }
  return byComponent;
}

export function buildEvidenceGraph({
  hits = [],
  signals = [],
  epistemicProfile,
  scoredLike = null,
  oovBurst = null,
  totalArticles = 0,
  residualObservations = [],
  openObservations = [],
  dataVoid = null,
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

  addHitNodes(hits, nodes, edges, sourceIds);
  addSignalNodes(signals, registry, nodes, edges);

  const oovClaimsByComponent = injectOovClusters(nodes, oovBurst, dataVoid);
  const mergedOpen = openObservations.length ? openObservations : residualObservations;
  const openClaimsByComponent = injectOpenObservations(nodes, mergedOpen);
  const residualClaimsByComponent = Object.fromEntries(COMPONENT_IDS.map((id) => [id, []]));
  const byComponent = buildComponentHypotheses({
    hits,
    signals,
    epistemicProfile,
    registry,
    totalArticles,
    nodes,
    oovClaimsByComponent,
    openClaimsByComponent,
    residualClaimsByComponent,
  });

  return {
    nodes,
    edges,
    by_component: byComponent,
    registry_ref_count: registry.refCount ?? 0,
    oov_cluster_count: nodes.oov_clusters.length,
  };
}

function injectOovClusters(nodes, oovBurst, dataVoid = null) {
  const byComponent = Object.fromEntries(COMPONENT_IDS.map((id) => [id, []]));
  if (!oovGraphEnabled()) return byComponent;

  const residualInBurst = oovBurst?.residual_observation_count ?? 0;
  const clusterCount = oovBurst?.top_cluster_count ?? 0;
  const voidLevel = dataVoid?.level ?? 'none';
  const elevatedVoid = voidLevel === 'elevated' || voidLevel === 'critical'
    || dataVoid?.digital_darkness === true;

  let shouldInject = oovBurst?.alert === true
    || clusterCount >= 3
    || (residualInBurst >= 2 && clusterCount >= 1);

  if (elevatedVoid && (clusterCount >= 1 || residualInBurst >= 1)) {
    shouldInject = true;
  }

  if (!shouldInject) return byComponent;

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

function confidenceRank(obs) {
  const map = { high: 3, medium: 2, low: 1 };
  return map[obs.confidence] ?? 2;
}

function appendOpenObservationClaim(nodes, byComponent, obs, compId, index) {
  const text = observationText(obs).slice(0, 200);
  const obsId = obs.observation_id ?? `obs-${compId}-${index}`;
  const ref = `open:${obsId}`;
  const isPipeline = obs.source === 'pipeline';
  nodes.signals.push({
    id: ref,
    signal_type: isPipeline ? 'open_observation' : 'residual_observation',
    source_type: obs.source_type ?? obs.source_label ?? null,
    evidence: text.slice(0, 300),
    grounding_tier: 'unverified',
  });
  const flags = isPipeline
    ? ['unverified', 'open_observation']
    : ['unverified', 'residual_observation', 'archive_only'];
  byComponent[compId].push({
    claim_id: `${compId}:open${index + 1}`,
    text: text || 'Open observation from parallel extract',
    support: [{ ref, mass: isPipeline ? 0.25 : 0.2 }],
    contradict: [],
    epistemic_flags: flags,
    observation_id: obsId,
  });
}

function injectOpenObservations(nodes, observations = []) {
  const byComponent = Object.fromEntries(COMPONENT_IDS.map((id) => [id, []]));
  if (!observations?.length) return byComponent;

  const cap = openObsGraphCap();
  const sorted = [...observations].sort((a, b) => {
    const confDiff = (b.routing_confidence ?? 0) - (a.routing_confidence ?? 0);
    if (confDiff !== 0) return confDiff;
    return confidenceRank(b) - confidenceRank(a);
  });

  const byComp = Object.fromEntries(COMPONENT_IDS.map((id) => [id, []]));
  for (const obs of sorted) {
    const compId = obs.component_id ?? mapObservationToComponent(obs);
    if (byComp[compId]) byComp[compId].push(obs);
    else byComp.narrative.push(obs);
  }

  let injected = 0;
  for (const compId of COMPONENT_IDS) {
    if (injected >= cap) break;
    const list = byComp[compId];
    for (let i = 0; i < list.length && injected < cap; i += 1) {
      appendOpenObservationClaim(nodes, byComponent, list[i], compId, i);
      injected += 1;
    }
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
  let componentId = 'narrative';
  for (const [compId, terms] of hints) {
    if (terms.some((t) => text.includes(t))) {
      componentId = compId;
      break;
    }
  }
  return componentId;
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

function buildSignalClaims(compId, compSignals, registry, profile) {
  const claims = [];
  let idx = 0;
  for (const s of compSignals.slice(0, 8)) {
    const ref = [...(registry.byRef?.entries() ?? [])].find(([, v]) => v.signal === s)?.[0]
      ?? buildRefFromSignal(s);
    const polarity = s.polarity_override === 'negative' ? 'weaken' : 'support';
    idx += 1;
    claims.push({
      claim_id: `${compId}:c${idx}`,
      text: String(s.evidence ?? s.description ?? '').slice(0, 280) || `${s.signal_type ?? s.type} signal`,
      support: polarity === 'support' ? [{ ref, mass: 0.3 }] : [],
      contradict: polarity === 'weaken' ? [{ ref, mass: 0.3 }] : [],
      epistemic_flags: profile.contested ? ['contested'] : [],
    });
  }
  return { claims, idx };
}

function buildRagClaims(compId, hits, profile, startIdx) {
  const claims = [];
  let idx = startIdx;
  const ragHits = hits
    .filter((h) => h.seed_origin === 'component_rag' && (!h.component_id || h.component_id === compId))
    .slice(0, RAG_SEED_CLAIM_CAP);

  for (const h of ragHits) {
    const flags = ['rag_seed'];
    if (profile.thin_evidence) flags.push('thin_evidence');
    const mass = profile.thin_evidence ? 0.2 : 0.25;
    idx += 1;
    claims.push({
      claim_id: `${compId}:r${idx}`,
      text: String(h.text ?? '').slice(0, 200),
      support: [{ ref: h.parentId ?? h.chunkId, mass }],
      contradict: [],
      epistemic_flags: flags,
    });
  }
  return { claims, idx };
}

function buildFallbackClaim(compId, hits, profile) {
  const h = hits[0];
  return {
    claim_id: `${compId}:c1`,
    text: String(h.text ?? '').slice(0, 200),
    support: [{ ref: h.parentId ?? h.chunkId, mass: 0.2 }],
    contradict: [],
    epistemic_flags: profile.thin_evidence ? ['thin_evidence', 'rag_seed'] : ['rag_seed'],
  };
}

function buildClaimsForComponent(compId, compSignals, hits, profile, registry, totalArticles) {
  const { claims: signalClaims, idx: signalIdx } = buildSignalClaims(compId, compSignals, registry, profile);
  const { claims: ragClaims } = buildRagClaims(compId, hits, profile, signalIdx);
  const claims = [...signalClaims, ...ragClaims];

  const skipRagOnlyFallback = profile.thin_evidence && totalArticles < THIN_ARTICLE_THRESHOLD;
  if (claims.length === 0 && hits.length > 0 && !skipRagOnlyFallback) {
    claims.push(buildFallbackClaim(compId, hits, profile));
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
