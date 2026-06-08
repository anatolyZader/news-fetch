/**
 * Compact evidence graph slices for specialist prompts (token savings).
 */

function refsFromClaim(c) {
  const support = (c.support ?? []).map((x) => x.ref).filter(Boolean);
  const contradict = (c.contradict ?? []).map((x) => x.ref).filter(Boolean);
  return [...support, ...contradict];
}

/**
 * @param {object} compGraph — evidenceGraph.by_component[componentId]
 */
export function compactComponentGraph(compGraph) {
  const claims = (compGraph?.claims ?? []).map((c) => ({
    id: c.claim_id,
    text: String(c.text ?? '').slice(0, 120),
    support_refs: refsFromClaim(c),
    flags: c.epistemic_flags ?? [],
  }));

  const oov = [];
  for (const c of compGraph?.claims ?? []) {
    if (!(c.epistemic_flags ?? []).includes('oov_cluster')) continue;
    const ref = (c.support ?? [])[0]?.ref ?? '';
    const clusterKey = String(ref).startsWith('oov:') ? ref.slice(4) : 'unknown';
    oov.push({
      cluster_key: clusterKey,
      sample_80: String(c.text ?? '').slice(0, 80),
      count: null,
    });
  }

  return {
    claims,
    gaps: compGraph?.retrieval_gaps ?? [],
    oov,
    epistemic_flags: compGraph?.epistemic_flags ?? [],
  };
}

/**
 * @param {object} compEp — epistemicProfile.by_component[componentId]
 */
export function compactEpistemicSlice(compEp) {
  const warnings = compEp?.dominance_warnings ?? [];
  return {
    mass: compEp?.evidence_mass ?? 0,
    thin: compEp?.thin_evidence ?? false,
    contested: compEp?.contested ?? false,
    delta: compEp?.delta_significance ?? null,
    media_mention_mass: compEp?.media_mention_mass ?? 0,
    dominance: warnings[0]?.message ?? null,
  };
}
