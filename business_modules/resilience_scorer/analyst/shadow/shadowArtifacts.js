/**
 * Shadow scoring + divergence metrics (analyst concern).
 */

const SEVERITY_TO_BAND = {
  low: [6, 8],
  moderate: [4, 7],
  high: [2, 5],
  critical: [1, 3],
  abstain: null,
};

/**
 * @param {object} agentAssessment — v2 or legacy mapped
 * @param {Record<string, object>} shadowScored — scoreComponents output
 */
export function computeDivergence(agentAssessment, shadowScored) {
  const components = agentAssessment.components ?? [];
  const hasAgentSeverity = components.some((c) => c?.severity != null);
  const generated_at = new Date().toISOString();

  if (!hasAgentSeverity) {
    const byComponent = {};
    for (const comp of components) {
      const id = comp.component_id;
      const shadow = shadowScored?.[id] ?? {};
      byComponent[id] = {
        agent_severity: null,
        shadow_score: shadow.score ?? null,
        severity_score_delta: null,
        shadow_evidence_mass: shadow.evidence_mass ?? null,
        agent_confidence: comp.confidence ?? null,
        aligned: null,
      };
    }
    return {
      mode: 'shadow_only',
      generated_at,
      by_component: byComponent,
      alignment_rate: null,
      aligned_count: 0,
      total_components: Object.keys(byComponent).length,
      note: 'No agent severity (closed-core assess); shadow scores only',
    };
  }

  const byComponent = {};
  for (const comp of agentAssessment.components ?? []) {
    const id = comp.component_id;
    const shadow = shadowScored?.[id] ?? {};
    const agentSeverity = comp.severity ?? null;
    const shadowScore = shadow.score ?? null;
    let severityScoreDelta = null;
    if (shadowScore != null && agentSeverity && SEVERITY_TO_BAND[agentSeverity]) {
      const [lo, hi] = SEVERITY_TO_BAND[agentSeverity];
      const mid = (lo + hi) / 2;
      severityScoreDelta = Math.round((shadowScore - mid) * 10) / 10;
    }
    byComponent[id] = {
      agent_severity: agentSeverity,
      shadow_score: shadowScore,
      severity_score_delta: severityScoreDelta,
      shadow_evidence_mass: shadow.evidence_mass ?? null,
      agent_confidence: comp.confidence ?? null,
      aligned: severityScoreDelta == null ? null : Math.abs(severityScoreDelta) <= 2,
    };
  }
  const alignedCount = Object.values(byComponent).filter((c) => c.aligned === true).length;
  const total = Object.keys(byComponent).length;
  return {
    mode: 'agent_shadow',
    generated_at,
    by_component: byComponent,
    alignment_rate: total > 0 ? alignedCount / total : null,
    aligned_count: alignedCount,
    total_components: total,
  };
}
