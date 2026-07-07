/**
 * Map semantic pattern alerts to operator recommendations (HITL pending).
 */

/**
 * @param {Array<object>} patterns from detectSemanticPatterns
 * @returns {Array<object>}
 */
export function buildOperatorRecommendations(patterns) {
  return (patterns ?? []).map((p) => ({
    id: `rec:${p.pattern_code}`,
    pattern_code: p.pattern_code,
    level: p.level,
    component_id: p.component_id ?? null,
    title_key: p.title_key,
    detail_key: p.detail_key,
    detail_params: p.detail_params ?? {},
    evidence_refs: p.evidence_refs ?? [],
    suggested_action_key: p.suggested_action_key ?? null,
    recommended_action: p.recommended_action ?? null,
    status: 'pending',
    acknowledged_at: null,
    acknowledged_by: null,
    dismiss_reason: null,
  }));
}
