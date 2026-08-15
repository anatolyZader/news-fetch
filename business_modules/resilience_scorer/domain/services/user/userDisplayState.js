/**
 * Two-axis display-state machine for user component rows.
 *
 * Pipeline position: finalize diagnostics — invoked from `buildSingleComponentDiagnostics`
 * after evidence partitions are known.
 *
 * Owns: assessment_state (assessed / insufficient / specialist_skipped), evidence_usage_state
 * (normal / quarantined / field_anchor_only / mixed), user_display_state + reason.
 * Does NOT: attach fields to assessment or render UI copy.
 *
 * Key collaborators: `user/componentDiagnostics.js`, specialist agent output,
 * narrative grounding scores (post-hoc QA threshold only).
 */

// ── Thresholds ────────────────────────────────────────────────────────────────

const LOW_GROUNDING_THRESHOLD = 0.5;

function deriveAssessmentStateWithClaims(comp, diagnostics, developerFlags) {
  const claimsCount = diagnostics.claims_count ?? 0;
  const severity = comp.severity ?? 'abstain';
  const confidence = comp.confidence ?? 'low';
  const userStatus = comp.user_status ?? null;
  const grounding = comp.narrative_grounding_score ?? comp.grounding_score ?? null;
  const contestedThin = comp.instrument?.contested_thin === true
    || comp.instrument?.contested === true;

  if (claimsCount > 0 && severity === 'abstain' && userStatus === 'insufficient_data') {
    developerFlags.push('contract_inconsistent');
    return { state: 'invalid_artifact', developerFlags };
  }

  // A component can reach this branch with claims allocated but no specialist
  // ever having run, in which case the narrative is empty and grounding is 0.
  // The state that follows is correct, but "assessed_low_confidence" reads as
  // "assessed and uncertain" — the flag says which one it actually was.
  if (diagnostics.specialist_ran === false) developerFlags.push('specialist_not_run');

  const lowConfidence = confidence === 'low'
    || (grounding != null && grounding < LOW_GROUNDING_THRESHOLD)
    || contestedThin
    || diagnostics.critic_downgraded;
  if (lowConfidence) {
    if (diagnostics.critic_downgraded) developerFlags.push('critic_downgraded');
    return { state: 'assessed_low_confidence', developerFlags };
  }
  return { state: 'assessed', developerFlags };
}

// ── Assessment state axis ─────────────────────────────────────────────────────

/**
 * Derive assessment_state from component output, coverage, and specialist status.
 *
 * @param {object} comp Component with claims, confidence, grounding scores.
 * @param {object} diagnostics From buildSingleComponentDiagnostics (partial).
 * @param {object} ctx epistemicProfileAvailable, degradeReason, assessmentMode.
 * @returns {{ state: string, developerFlags: string[] }}
 */
export function deriveAssessmentState(comp, diagnostics, ctx) {
  const developerFlags = [];
  const claimsCount = diagnostics.claims_count ?? 0;
  const scoringUsed = diagnostics.coverage?.scoring_used ?? 0;
  const quarantined = diagnostics.coverage?.quarantined ?? 0;
  const macroContext = diagnostics.coverage?.macro_context ?? 0;
  const excluded = diagnostics.coverage?.excluded_by_scope ?? 0;
  const totalEvidence = scoringUsed + quarantined + macroContext + excluded;

  if (claimsCount > 0) {
    return deriveAssessmentStateWithClaims(comp, diagnostics, developerFlags);
  }

  if (diagnostics.specialist_ran && claimsCount === 0 && (diagnostics.repair_log?.length > 0 || comp.repair_log?.length > 0)) {
    return { state: 'specialist_failed', developerFlags: ['specialist_output_empty'] };
  }

  if (diagnostics.specialist_ran && claimsCount === 0 && ctx.degradeReason) {
    return { state: 'specialist_failed', developerFlags: ['assessment_degraded'] };
  }

  if (scoringUsed > 0 && !diagnostics.specialist_ran) {
    const reasonFlag = diagnostics.specialist_tier === 'C' ? 'tier_c_skipped' : 'specialist_not_run';
    developerFlags.push(reasonFlag);
    return { state: 'specialist_skipped', developerFlags };
  }

  if (totalEvidence === 0) {
    if (ctx.epistemicProfileAvailable === false && diagnostics.developer_flags?.includes('diagnostic_incomplete')) {
      return { state: 'insufficient_data', developerFlags: ['diagnostic_incomplete_fallback'] };
    }
    return { state: 'insufficient_data', developerFlags };
  }

  if (quarantined > 0 || macroContext > 0 || excluded > 0) {
    return { state: 'insufficient_data', developerFlags: ['context_only_evidence'] };
  }

  return { state: 'insufficient_data', developerFlags };
}

// ── Evidence usage axis ───────────────────────────────────────────────────────

/**
 * Classify how evidence was used for this component (scoring vs quarantine vs macro).
 *
 * @param {object} part Evidence partition slice for one component.
 * @param {string} [assessmentMode] normal | field_anchor_only | abstained.
 * @returns {string} evidence_usage_state enum value.
 */
export function deriveEvidenceUsageState(part, assessmentMode = 'normal') {
  const scoringUsed = part.scoring_used ?? 0;
  const quarantined = part.quarantined ?? 0;
  const macroContext = part.macro_context ?? 0;
  const excluded = part.excluded_by_scope ?? 0;
  const fieldAnchor = part.field_anchor_used ?? 0;

  const nonEmpty = [
    scoringUsed > 0 ? 'scoring' : null,
    quarantined > 0 ? 'quarantined' : null,
    macroContext > 0 ? 'macro' : null,
    excluded > 0 ? 'excluded' : null,
  ].filter(Boolean);

  if (nonEmpty.length >= 2) return 'mixed';
  if (assessmentMode === 'field_anchor_only' && fieldAnchor > 0 && quarantined > 0) return 'mixed';
  if (assessmentMode === 'field_anchor_only' && (fieldAnchor > 0 || scoringUsed > 0)) return 'field_anchor_only';
  if (quarantined > 0 && scoringUsed === 0) return 'quarantined_digital_present';
  if (macroContext > 0 && scoringUsed === 0) return 'macro_context_only';
  if (excluded > 0 && scoringUsed === 0) return 'scope_excluded_only';
  return 'normal';
}

function specialistSkippedReason(diagnostics) {
  if (diagnostics.specialist_tier === 'C' && !diagnostics.specialist_selected) {
    return 'tier_c_not_in_focus';
  }
  if (diagnostics.specialist_tier === 'C') return 'tier_c_skipped';
  return 'specialist_not_run';
}

// ── User display state ────────────────────────────────────────────────────

/**
 * Map two-axis diagnostic inputs to user-facing display state + reason.
 *
 * @param {string} assessmentState From deriveAssessmentState.
 * @param {string} evidenceUsageState From deriveEvidenceUsageState.
 * @param {object} diagnostics Full diagnostic record for the component.
 * @returns {{ state: string, reason: string, inputs: object }}
 */
export function deriveUserDisplayState(assessmentState, evidenceUsageState, diagnostics) {
  const inputs = {
    claims_count: diagnostics.claims_count ?? 0,
    scoring_signal_count: diagnostics.coverage?.scoring_used ?? 0,
    quarantined_count: diagnostics.coverage?.quarantined ?? 0,
    macro_context_count: diagnostics.coverage?.macro_context ?? 0,
    specialist_tier: diagnostics.specialist_tier ?? null,
    specialist_ran: diagnostics.specialist_ran === true,
    specialist_selected: diagnostics.specialist_selected === true,
    assessment_state: assessmentState,
    evidence_usage_state: evidenceUsageState,
  };

  if (assessmentState === 'assessed') {
    return { state: 'assessed_claims', reason: 'claims_present', inputs };
  }
  if (assessmentState === 'assessed_low_confidence') {
    const reason = diagnostics.critic_downgraded ? 'critic_downgraded' : 'low_confidence';
    return { state: 'assessed_low_confidence', reason, inputs };
  }
  if (assessmentState === 'specialist_skipped') {
    return { state: 'specialist_skipped', reason: specialistSkippedReason(diagnostics), inputs };
  }
  if (assessmentState === 'specialist_failed') {
    return { state: 'specialist_skipped', reason: 'specialist_failed', inputs };
  }
  if (assessmentState === 'invalid_artifact') {
    return { state: 'assessed_low_confidence', reason: 'contract_inconsistent', inputs };
  }

  const totalEvidence = (diagnostics.coverage?.scoring_used ?? 0)
    + (diagnostics.coverage?.quarantined ?? 0)
    + (diagnostics.coverage?.macro_context ?? 0)
    + (diagnostics.coverage?.excluded_by_scope ?? 0);

  if (totalEvidence > 0 && (diagnostics.coverage?.scoring_used ?? 0) === 0) {
    const reason = evidenceUsageState === 'macro_context_only'
      ? 'macro_context_only'
      : 'digital_darkness_quarantine';
    return { state: 'evidence_quarantined', reason, inputs };
  }

  if (diagnostics.developer_flags?.includes('diagnostic_incomplete')) {
    return { state: 'insufficient_data', reason: 'diagnostic_incomplete', inputs };
  }

  return { state: 'insufficient_data', reason: 'no_evidence_anywhere', inputs };
}
