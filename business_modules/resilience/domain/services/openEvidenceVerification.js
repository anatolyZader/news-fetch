/**
 * Verify open observation claims after specialist investigation (Phase 2).
 */

const OPEN_REF_PREFIX = /^open:/;
const RESIDUAL_REF_PREFIX = /^residual:/;
const RAG_REF_PREFIX = /^(chunk:|archive:|parent:)/;

function claimEvidenceRefs(claim) {
  if (Array.isArray(claim.evidence_refs)) return claim.evidence_refs.map(String);
  const support = [...(claim.support ?? []), ...(claim.contradict ?? [])];
  return support.map((s) => String(s.ref ?? s)).filter(Boolean);
}

function hasOpenRef(refs) {
  return refs.some((r) => OPEN_REF_PREFIX.test(r) || RESIDUAL_REF_PREFIX.test(r));
}

function hasCorroboratingRef(refs) {
  return refs.some((r) => RAG_REF_PREFIX.test(r) || (!OPEN_REF_PREFIX.test(r) && !RESIDUAL_REF_PREFIX.test(r)));
}

function specialistMultiHop(componentAssessment) {
  const usage = componentAssessment?.tool_usage ?? {};
  return Number(usage.multiHop ?? usage.multi_hop ?? 0) >= 1;
}

function componentClaims(assessment, componentId) {
  const agent = assessment._agent_components?.find((c) => c.component_id === componentId);
  if (agent?.claims?.length) return agent;
  const legacy = assessment.components?.find((c) => c.component_id === componentId);
  if (!legacy) return null;
  return {
    ...legacy,
    claims: (legacy.narrative_claims ?? []).map((c, i) => ({
      claim_id: c.claim_id ?? `${componentId}:legacy${i + 1}`,
      text: c.text,
      evidence_refs: c.signal_refs ?? [],
    })),
  };
}

function resolveCorroborationLevel(multiHop, refs) {
  if (multiHop && hasCorroboratingRef(refs)) return 'multi_hop_and_rag';
  if (multiHop) return 'multi_hop';
  if (hasCorroboratingRef(refs)) return 'rag_chunk';
  return null;
}

function verifyOpenClaimEntry({
  claim,
  componentId,
  multiHop,
  obsById,
  seen,
}) {
  const refs = claimEvidenceRefs(claim);
  if (!hasOpenRef(refs)) return null;

  const openRef = refs.find((r) => OPEN_REF_PREFIX.test(r) || RESIDUAL_REF_PREFIX.test(r));
  const observationId = openRef?.includes(':') ? openRef.split(':').slice(1).join(':') : null;
  const obs = observationId ? obsById.get(observationId) : null;
  const resolvedId = obs?.observation_id ?? observationId ?? 'unknown';
  const corroboration_level = resolveCorroborationLevel(multiHop, refs);
  if (!corroboration_level) return null;

  const key = `${resolvedId}:${componentId}:${claim.claim_id ?? claim.text?.slice(0, 40)}`;
  if (seen.has(key)) return null;
  seen.add(key);

  return {
    observation_id: resolvedId,
    component_id: componentId,
    claim_id: claim.claim_id ?? null,
    corroboration_level,
    observation: obs ?? null,
  };
}

function verifyGraphClaimEntry(claim, componentId, multiHop, obsById, seen) {
  const refs = claimEvidenceRefs(claim);
  if (!hasOpenRef(refs)) return null;
  const openRef = refs.find((r) => OPEN_REF_PREFIX.test(r));
  const observationId = openRef?.split(':')[1];
  const obs = observationId ? obsById.get(observationId) : null;
  if (!obs) return null;
  const key = `${obs.observation_id}:${componentId}:${claim.claim_id}`;
  if (seen.has(key)) return null;
  if (!multiHop && !hasCorroboratingRef(refs)) return null;
  seen.add(key);
  return {
    observation_id: obs.observation_id,
    component_id: componentId,
    claim_id: claim.claim_id ?? null,
    corroboration_level: hasCorroboratingRef(refs) ? 'rag_chunk' : 'multi_hop',
    observation: obs,
  };
}

function verifyOpenClaimsFromGraph(assessment, evidenceGraph, obsById, seen) {
  const verified = [];
  for (const [componentId, graph] of Object.entries(evidenceGraph.by_component)) {
    const comp = assessment.components?.find((c) => c.component_id === componentId);
    if (comp?.specialist_ran !== true) continue;
    const multiHop = specialistMultiHop(componentClaims(assessment, componentId));
    for (const claim of graph.claims ?? []) {
      const entry = verifyGraphClaimEntry(claim, componentId, multiHop, obsById, seen);
      if (entry) verified.push(entry);
    }
  }
  return verified;
}

/**
 * @param {object} assessment
 * @param {object[]} openObservations
 * @param {object} [evidenceGraph]
 * @returns {Array<{ observation_id: string, component_id: string, claim_id: string, corroboration_level: string }>}
 */
export function verifyOpenEvidenceClaims(assessment, openObservations = [], evidenceGraph = null) {
  if (!assessment || !openObservations.length) return [];

  const obsById = new Map(openObservations.map((o) => [String(o.observation_id), o]));
  const verified = [];
  const seen = new Set();

  for (const comp of assessment.components ?? []) {
    const componentId = comp.component_id;
    if (comp.specialist_ran !== true) continue;

    const compAssessment = componentClaims(assessment, componentId);
    if (!compAssessment?.claims?.length) continue;

    const multiHop = specialistMultiHop(compAssessment);

    for (const claim of compAssessment.claims) {
      const entry = verifyOpenClaimEntry({
        claim,
        componentId,
        multiHop,
        obsById,
        seen,
      });
      if (entry) verified.push(entry);
    }
  }

  if (evidenceGraph?.by_component && verified.length === 0) {
    verified.push(...verifyOpenClaimsFromGraph(assessment, evidenceGraph, obsById, seen));
  }

  return verified;
}
