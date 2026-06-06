/**
 * Epistemic retrieval policy application (shared, no agent/chat deps).
 */

/**
 * Apply diversify policy — down-rank hits from over-represented source types.
 * @param {object[]} hits
 * @param {object} epistemicProfile
 */
export function applyRetrievalPolicies(hits, epistemicProfile) {
  const policies = epistemicProfile?.retrieval_policies?.diversify ?? [];
  if (!policies.length) return hits;

  const capByType = Object.fromEntries(
    policies.map((p) => [p.source_type, p.max_share ?? 0.35]),
  );
  const byType = {};
  for (const h of hits) {
    const st = h.sourceType ?? h.source_type ?? '_unknown';
    byType[st] = (byType[st] ?? 0) + 1;
  }
  const total = hits.length || 1;

  return [...hits].sort((a, b) => {
    const stA = a.sourceType ?? a.source_type ?? '_unknown';
    const stB = b.sourceType ?? b.source_type ?? '_unknown';
    const shareA = (byType[stA] ?? 0) / total;
    const shareB = (byType[stB] ?? 0) / total;
    const capA = capByType[stA];
    const capB = capByType[stB];
    const penalizeA = capA != null && shareA > capA ? 1 : 0;
    const penalizeB = capB != null && shareB > capB ? 1 : 0;
    if (penalizeA !== penalizeB) return penalizeA - penalizeB;
    return (b.rrfScore ?? b.relevanceScore ?? 0) - (a.rrfScore ?? a.relevanceScore ?? 0);
  });
}
