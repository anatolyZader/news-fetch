/**
 * Assessment-level investigation transparency for operators.
 */

/**
 * @param {object} assessment
 * @param {object} ctx
 * @returns {object}
 */
export function buildInvestigationSummary(assessment, ctx = {}) {
  const {
    investigationSignals = [],
    scoringSignals = [],
    narrativeScopeSignals = [],
    narrativeNationalContext = [],
    shadowScoringAvailable = false,
    budgetDegradeMode = null,
    scoringPartitionApplied = false,
    scoringAssessmentMode = null,
    signalsScoringUsed = null,
    priorQuarantineSkipped = null,
  } = ctx;

  const investigationSet = new Set(investigationSignals);
  const scoringSet = new Set(scoringSignals);
  let scoringQuarantined = 0;
  for (const signal of investigationSet) {
    if (!scoringSet.has(signal)) scoringQuarantined += 1;
  }

  return {
    agent_ran: assessment?.agent_trace_id != null,
    degrade_reason: assessment?.degrade_reason
      ?? assessment?.assessment_degraded?.reason
      ?? null,
    synthesis_mode: assessment?.synthesis_mode ?? null,
    budget_degrade_mode: budgetDegradeMode
      ?? assessment?.budget_snapshot?.degrade_mode
      ?? null,
    signals_investigation: investigationSignals.length,
    signals_narrative_scope: narrativeScopeSignals.length,
    signals_national_context: narrativeNationalContext.length,
    signals_scoring_quarantined: scoringQuarantined,
    signals_scoring_used: signalsScoringUsed ?? scoringSignals.length,
    scoring_partition_applied: scoringPartitionApplied === true,
    scoring_assessment_mode: scoringAssessmentMode ?? null,
    prior_quarantine_skipped: priorQuarantineSkipped ?? null,
    shadow_scoring_available: shadowScoringAvailable === true,
    investigation_mode: assessment?.epistemic_status?.investigation_mode ?? null,
  };
}
