/**
 * Shadow scoring + divergence metrics (Option B).
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
    generated_at: new Date().toISOString(),
    alignment_rate: total ? alignedCount / total : null,
    by_component: byComponent,
  };
}
