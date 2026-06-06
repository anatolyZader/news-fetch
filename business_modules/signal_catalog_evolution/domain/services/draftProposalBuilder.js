/**
 * Pure transform: OOV cluster → draft proposal shape.
 */

/**
 * @param {object} cluster from buildGapReport
 * @param {object} [llmFields] from anthropic adapter
 */
export function buildDraftProposalFromCluster(cluster, llmFields = {}) {
  const sample = cluster.sample_evidence ?? [];
  return {
    cluster_key: cluster.key ?? 'unknown',
    capture_count: cluster.count ?? 0,
    kinds: cluster.kinds ?? {},
    sample_evidence: sample.slice(0, 5),
    related_types: cluster.related_types ?? [],
    nearest_catalog: cluster.nearest_catalog ?? [],
    counterexamples: cluster.counterexamples ?? [],
    priority_score: cluster.priority_score ?? 0,
    suggested_signal_type: llmFields.suggested_signal_type ?? cluster.key ?? '',
    suggested_label: llmFields.suggested_label ?? '',
    suggested_definition: llmFields.suggested_definition ?? '',
    merge_vs_new_recommendation: llmFields.merge_vs_new_recommendation ?? 'review',
    rationale: llmFields.rationale ?? '',
  };
}
