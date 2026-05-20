/**
 * Norris et al. (2008) derived capacities layer (additive).
 *
 * This does NOT replace the 8-component model. It aggregates existing component
 * scores and highlights Norris-aligned diagnostics (robustness/redundancy/rapidity).
 */
 
import { RESILIENCE_COMPONENTS } from '../resilienceComponents.js';
 
const COMPONENT_DEF_BY_ID = Object.fromEntries(RESILIENCE_COMPONENTS.map((c) => [c.id, c]));
 
function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
 
function safeNum(x, fallback = 0) {
  return Number.isFinite(x) ? x : fallback;
}
 
function weightedMean(rows) {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const v = safeNum(r.value, null);
    const w = safeNum(r.weight, 0);
    if (v == null || w <= 0) continue;
    num += v * w;
    den += w;
  }
  return den > 0 ? num / den : null;
}
 
function collectSignals(scoredComponents, componentIds) {
  const out = [];
  for (const cid of componentIds) {
    const comp = scoredComponents?.[cid];
    const signals = comp?.signals ?? [];
    for (const s of signals) {
      out.push({ ...s, _component_id: cid });
    }
  }
  return out;
}
 
function computeRapidityDiagnostic(signals) {
  const rapid = signals.filter((s) => s.signal_type === 'rapid_mobilization').length;
  const delayed = signals.filter((s) => s.signal_type === 'delayed_mobilization').length;
  if (rapid === 0 && delayed === 0) return null;
  const score = (rapid - delayed) / (rapid + delayed);
  // map [-1,1] -> [0,1]
  return clamp01((score + 1) / 2);
}
 
function computeRedundancyDiagnostic(scoredComponents, componentIds) {
  // proxy redundancy as cross-source diversity (bounded) across member components
  const diversities = componentIds.map((cid) => safeNum(scoredComponents?.[cid]?.source_diversity, 0));
  const mean = diversities.length ? diversities.reduce((a, b) => a + b, 0) / diversities.length : 0;
  return clamp01(mean / 1.5); // 1.5 ≈ "high enough" in current scoring
}
 
function computeRobustnessDiagnostic(scoredComponents, componentIds) {
  // proxy robustness as evidence certainty (bounded) across member components
  const certs = componentIds.map((cid) => safeNum(scoredComponents?.[cid]?.certainty, 0));
  const mean = certs.length ? certs.reduce((a, b) => a + b, 0) / certs.length : 0;
  return clamp01(mean);
}
 
function rankTopContributors(signals, n = 3) {
  return (signals ?? [])
    .filter((s) => Number.isFinite(s._contribution_raw ?? s._contribution))
    .map((s) => ({
      signal_type: s.signal_type ?? s.type ?? null,
      component_id: s._component_id ?? null,
      source_type: s.source_type ?? null,
      article_source: s.article_source ?? null,
      article_url: s.article_url ?? null,
      evidence: s.evidence ?? null,
      _contribution_raw: safeNum(s._contribution_raw, safeNum(s._contribution, 0)),
    }))
    .sort((a, b) => Math.abs(b._contribution_raw) - Math.abs(a._contribution_raw))
    .slice(0, n);
}
 
function buildCapacity({
  capacity_id,
  label_en,
  label_he,
  component_ids,
  scoredComponentsDeterministic,
  scoredComponentsDisplay,
  rapiditySignalsOfInterest = false,
}) {
  const rowsForScore = component_ids.map((cid) => {
    const display = scoredComponentsDisplay?.[cid] ?? scoredComponentsDeterministic?.[cid] ?? {};
    const score = safeNum(display.score, null);
    const certainty = safeNum(scoredComponentsDeterministic?.[cid]?.certainty, 0);
    // Use certainty as a stable weighting factor.
    return { value: score, weight: certainty };
  });
 
  const score = weightedMean(rowsForScore);
  const evidence_mass = component_ids.reduce((sum, cid) => sum + safeNum(scoredComponentsDeterministic?.[cid]?.evidence_mass, 0), 0);
  const certainty = weightedMean(component_ids.map((cid) => ({
    value: safeNum(scoredComponentsDeterministic?.[cid]?.certainty, 0),
    weight: Math.max(0.0001, safeNum(scoredComponentsDeterministic?.[cid]?.evidence_mass, 0)),
  })));
 
  const allSignals = collectSignals(scoredComponentsDeterministic, component_ids);
  const robustness = computeRobustnessDiagnostic(scoredComponentsDeterministic, component_ids);
  const redundancy = computeRedundancyDiagnostic(scoredComponentsDeterministic, component_ids);
  const rapidity = rapiditySignalsOfInterest ? computeRapidityDiagnostic(allSignals) : null;
 
  const top_contributors = rankTopContributors(allSignals, 3);
 
  return {
    capacity_id,
    label_en,
    label_he,
    mapped_components: component_ids.map((cid) => ({
      component_id: cid,
      label_en: COMPONENT_DEF_BY_ID[cid]?.name_en ?? cid,
      score: (scoredComponentsDisplay?.[cid]?.score ?? scoredComponentsDeterministic?.[cid]?.score ?? null),
    })),
    score,
    evidence_mass,
    certainty,
    diagnostics: {
      robustness,
      redundancy,
      rapidity,
    },
    top_contributors,
  };
}
 
export function computeNorrisCapacities(scoredComponentsDeterministic, scoredComponentsDisplay) {
  return [
    buildCapacity({
      capacity_id: 'economic_development',
      label_en: 'Economic development',
      label_he: 'התפתחות כלכלית',
      component_ids: ['functional_continuity', 'wellbeing_at_risk'],
      scoredComponentsDeterministic,
      scoredComponentsDisplay,
      rapiditySignalsOfInterest: true,
    }),
    buildCapacity({
      capacity_id: 'social_capital',
      label_en: 'Social capital',
      label_he: 'הון חברתי',
      component_ids: ['community_capital', 'belonging_solidarity'],
      scoredComponentsDeterministic,
      scoredComponentsDisplay,
      rapiditySignalsOfInterest: false,
    }),
    buildCapacity({
      capacity_id: 'information_and_communication',
      label_en: 'Information & communication',
      label_he: 'מידע ותקשורת',
      component_ids: ['information_communication', 'narrative'],
      scoredComponentsDeterministic,
      scoredComponentsDisplay,
      rapiditySignalsOfInterest: false,
    }),
    buildCapacity({
      capacity_id: 'community_competence',
      label_en: 'Community competence',
      label_he: 'כשירות קהילתית',
      component_ids: ['leadership', 'community_capital'],
      scoredComponentsDeterministic,
      scoredComponentsDisplay,
      rapiditySignalsOfInterest: true,
    }),
  ];
}

