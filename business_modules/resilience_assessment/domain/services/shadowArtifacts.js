/**
 * Shadow scoring + divergence metrics (Option B).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

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
      aligned: severityScoreDelta != null ? Math.abs(severityScoreDelta) <= 2 : null,
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

/**
 * @param {object} params
 */
export function writeShadowArtifacts(params) {
  const {
    reportsDir = 'daily_reports',
    scopeId = 'national',
    date,
    shadowScored,
    shadowNarratives = null,
    divergence,
  } = params;

  mkdirSync(reportsDir, { recursive: true });
  const base = join(reportsDir, `${scopeId}-${date}`);

  const scoresPath = join(reportsDir, `shadow-scores-${scopeId}-${date}.json`);
  writeFileSync(scoresPath, JSON.stringify({ date, scopeId, scored: shadowScored }, null, 2));

  const divPath = join(reportsDir, `divergence-${scopeId}-${date}.json`);
  writeFileSync(divPath, JSON.stringify({ date, scopeId, ...divergence }, null, 2));

  let narrativesPath = null;
  if (shadowNarratives) {
    narrativesPath = join(reportsDir, `shadow-narratives-${scopeId}-${date}.json`);
    writeFileSync(narrativesPath, JSON.stringify({ date, scopeId, assessment: shadowNarratives }, null, 2));
  }

  return { scoresPath, divPath, narrativesPath, base };
}
