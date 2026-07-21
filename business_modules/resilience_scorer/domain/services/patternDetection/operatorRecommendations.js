/**
 * Map semantic pattern alerts to operator recommendations (HITL pending).
 *
 * Pipeline position: STAGE-2 assess finalize — converts deterministic pattern
 * detections into pending operator recommendations on the assessment payload.
 *
 * Owns: recommendation record shape (`status: pending`, evidence refs, i18n keys).
 * Does NOT: detect patterns (see `semanticPatternAlerts.js`) or rank actions
 * (see `actionCompass/`).
 *
 * Key collaborators: `patternDetection/semanticPatternAlerts.js`,
 * `services/operator/`, report finalize and client recommendation UI.
 */

// ---------------------------------------------------------------------------
// Recommendation builder
// ---------------------------------------------------------------------------

/**
 * Map semantic pattern alerts to pending operator recommendations.
 * @param {Array<object>} patterns from `detectSemanticPatterns`
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
