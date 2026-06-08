/**
 * Compact planner/synthesizer prompt payloads (token savings).
 */
import { compactEpistemicSlice } from './compactEvidenceGraph.js';

function truncate(text, max = 120) {
  return String(text ?? '').slice(0, max);
}

function claimHasOovFlag(claim) {
  const flags = claim.epistemic_flags ?? claim.flags ?? [];
  return flags.includes('oov_cluster') || flags.includes('unverified');
}

/**
 * @param {object} profile — full epistemic profile
 */
export function compactEpistemicProfileForPlanner(profile) {
  const by = {};
  for (const [id, ep] of Object.entries(profile?.by_component ?? {})) {
    const slice = compactEpistemicSlice(ep);
    by[id] = {
      ...slice,
      investigation_eligible: ep.investigation_eligible ?? undefined,
      residual_observation_count: ep.residual_observation_count ?? undefined,
      presence_gate_triggered: ep.presence_gate_triggered ?? undefined,
      salience_critical: ep.salience_critical ?? undefined,
      operator_status: ep.operator_status ?? undefined,
    };
  }
  return { by_component: by };
}

/**
 * @param {object} ctx — planner context from plannerContextBuilder
 */
export function compactPlannerContextForPrompt(ctx) {
  if (!ctx) return null;

  const classified_gaps = (ctx.classified_gaps ?? []).slice(0, 12).map((g) => ({
    component_id: g.component_id,
    gap_type: g.gap_type,
    gap_text: truncate(g.gap_text ?? g.text ?? g.description),
    reason: truncate(g.reason),
    priority: g.priority,
  }));

  const out = {
    investigation_gaps: (ctx.investigation_gaps ?? []).map((g) => ({
      ...g,
      gap_text: truncate(g.gap_text ?? g.text ?? g.description),
      reason: truncate(g.reason),
    })),
    media_volume_anomalies: (ctx.media_volume_anomalies ?? []).slice(0, 8),
    oov_summary: ctx.oov_summary,
    exploration_candidates: (ctx.exploration_candidates ?? []).slice(0, 6),
    residual_summary: ctx.residual_summary,
    archive_anomalies: (ctx.archive_anomalies ?? []).slice(0, 8),
    classified_gaps,
  };

  if (!out.investigation_gaps?.length && ctx.retrieval_gaps_by_component) {
    out.retrieval_gaps_by_component = ctx.retrieval_gaps_by_component;
  }

  return out;
}

/**
 * @param {object[]} assessments — component assessments for synthesizer
 */
export function compactComponentAssessmentsForSynth(assessments) {
  return (assessments ?? []).map((a) => {
    const oovClaims = (a.claims ?? []).filter(claimHasOovFlag).slice(0, 5).map((c) => ({
      text: truncate(c.text, 120),
      evidence_refs: c.evidence_refs,
      epistemic_flags: c.epistemic_flags ?? c.flags,
    }));
    const out = {
      component_id: a.component_id,
      severity: a.severity,
      confidence: a.confidence,
      operator_status: a.operator_status,
      specialist_tier: a.specialist_tier,
      narrative: truncate(a.narrative, 400),
      claims: (a.claims ?? []).slice(0, 8).map((c) => ({
        text: truncate(c.text, 120),
        evidence_refs: c.evidence_refs,
      })),
      retrieval_gaps: (a.retrieval_gaps ?? []).slice(0, 6),
    };
    if (oovClaims.length) out.oov_claims = oovClaims;
    const dissent = String(a.dissent_summary ?? '');
    if (dissent && dissent.length < 200) out.dissent_summary = dissent;
    return out;
  });
}

/**
 * @param {object} epistemicProfile
 */
export function compactEpistemicByComponentForSynth(epistemicProfile) {
  const by = {};
  for (const [id, ep] of Object.entries(epistemicProfile?.by_component ?? {})) {
    by[id] = compactEpistemicSlice(ep);
  }
  return by;
}
