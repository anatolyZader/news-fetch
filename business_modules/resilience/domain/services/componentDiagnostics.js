/**
 * Finalize-time component diagnostics: evidence partitions, two-axis states, operator display.
 */
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import { shouldAbstainFromInvestigation } from '../../../epistemic_features/index.js';
import { FIELD_SOURCE_TYPES } from './dataVoid/sourceChannels.js';
import { contributionForSignal } from '../epistemic/massContribution.js';
import { SIGNAL_TO_COMPONENTS } from './signalRouter.js';
import { buildInvestigationSummary } from './investigationSummary.js';

const LOW_GROUNDING_THRESHOLD = 0.5;
const VALID_COMPONENT_SET = new Set(COMPONENT_IDS);

/**
 * @param {string} componentId
 * @param {Array<object>} signals
 * @param {object} [signalWeights]
 * @returns {{ count: number, mass: number }}
 */
export function countSignalsForComponent(componentId, signals, signalWeights = SIGNAL_TO_COMPONENTS) {
  const list = Array.isArray(signals) ? signals : [];
  let count = 0;
  let mass = 0;
  for (const signal of list) {
    const signalType = signal.signal_type ?? signal.type;
    const mapping = signalWeights[signalType];
    if (mapping == null || !(componentId in mapping)) continue;
    count += 1;
    mass += contributionForSignal(signal, mapping[componentId]);
  }
  return { count, mass: round2(mass) };
}

/**
 * @param {object} params
 * @returns {Record<string, object>}
 */
export function buildEvidencePartitionsByComponent({
  componentIds = COMPONENT_IDS,
  signalsForScoring = [],
  investigationSignals = [],
  macroSignals = [],
  quarantinedSignals = [],
  scopedSignals = [],
  assessmentMode = 'normal',
  signalWeights = SIGNAL_TO_COMPONENTS,
}) {
  const metricsSet = new Set(signalsForScoring);
  const investigationSet = new Set(
    investigationSignals.length > 0 ? investigationSignals : signalsForScoring,
  );
  const macroSet = new Set(macroSignals);
  const scopedSet = new Set(scopedSignals);

  const scoringQuarantinedSignals = [];
  for (const signal of investigationSet) {
    if (!metricsSet.has(signal)) scoringQuarantinedSignals.push(signal);
  }

  /** @type {Record<string, object>} */
  const out = {};
  for (const componentId of componentIds) {
    const scoringUsed = countSignalsForComponent(componentId, signalsForScoring, signalWeights);
    const investigationUsed = countSignalsForComponent(
      componentId,
      [...investigationSet],
      signalWeights,
    );
    const scoringQuarantined = countSignalsForComponent(
      componentId,
      scoringQuarantinedSignals,
      signalWeights,
    );
    const quarantined = countSignalsForComponent(componentId, quarantinedSignals, signalWeights);
    const macroContext = countSignalsForComponent(componentId, macroSignals, signalWeights);

    let fieldAnchorUsed = { count: 0, mass: 0 };
    if (assessmentMode === 'field_anchor_only' && scoringUsed.count > 0) {
      const fieldSignals = signalsForScoring.filter((s) => FIELD_SOURCE_TYPES.has(s?.source_type));
      fieldAnchorUsed = countSignalsForComponent(componentId, fieldSignals, signalWeights);
    }

    const excludedSignals = [];
    for (const signal of scopedSet) {
      if (metricsSet.has(signal) || macroSet.has(signal)) continue;
      const signalType = signal?.signal_type ?? signal?.type;
      const mapping = signalWeights[signalType];
      if (mapping != null && componentId in mapping) excludedSignals.push(signal);
    }
    const excludedByScope = countSignalsForComponent(componentId, excludedSignals, signalWeights);

    out[componentId] = {
      scoring_used: scoringUsed.count,
      evidence_mass_scoring_used: scoringUsed.mass,
      investigation_used: investigationUsed.count,
      evidence_mass_investigation_used: investigationUsed.mass,
      scoring_quarantined: scoringQuarantined.count,
      evidence_mass_scoring_quarantined: scoringQuarantined.mass,
      quarantined: quarantined.count,
      evidence_mass_quarantined: quarantined.mass,
      macro_context: macroContext.count,
      field_anchor_used: fieldAnchorUsed.count,
      excluded_by_scope: excludedByScope.count,
    };
  }
  return out;
}

/**
 * @param {object} comp — legacy/v2 merged component
 * @param {object} partitions
 * @param {object} ctx
 * @returns {object}
 */
export function buildSingleComponentDiagnostics(comp, partitions, ctx) {
  const componentId = comp.component_id;
  const part = partitions[componentId] ?? {};
  const claims = comp.narrative_claims ?? comp.claims ?? [];
  const claimsCount = Array.isArray(claims) ? claims.length : 0;
  const analystFlags = [];

  const coverage = {
    scoring_used: part.scoring_used ?? 0,
    investigation_used: part.investigation_used ?? part.scoring_used ?? 0,
    scoring_quarantined: part.scoring_quarantined ?? 0,
    quarantined: part.quarantined ?? 0,
    macro_context: part.macro_context ?? 0,
    excluded_by_scope: part.excluded_by_scope ?? 0,
    claims: claimsCount,
  };

  if (!ctx.epistemicProfileAvailable) {
    analystFlags.push('diagnostic_incomplete');
  }

  const specialistTier = comp.specialist_tier ?? null;
  const specialistRan = comp.specialist_ran === true;
  const specialistSelected = ctx.specialistSelectedSet?.has(componentId) === true;
  const repairLog = comp.repair_log ?? [];
  const criticDowngraded = repairLog.some((r) => String(r?.action ?? '').includes('downgrade'));
  const degradeReason = ctx.degradeReason ?? null;

  const diagnostics = {
    component_id: componentId,
    coverage,
    evidence_mass_scoring_used: part.evidence_mass_scoring_used ?? 0,
    evidence_mass_quarantined: part.evidence_mass_quarantined ?? 0,
    specialist_selected: specialistSelected,
    specialist_tier: specialistTier,
    specialist_ran: specialistRan,
    specialist_failed: false,
    claims_count: claimsCount,
    critic_downgraded: criticDowngraded,
    degrade_reason: degradeReason,
    analyst_flags: analystFlags,
  };

  const assessmentStateResult = deriveAssessmentState(comp, diagnostics, ctx);
  const evidenceUsageState = deriveEvidenceUsageState(part, ctx.assessmentMode);
  const operatorDisplay = deriveOperatorDisplayState(
    assessmentStateResult.state,
    evidenceUsageState,
    diagnostics,
  );

  return {
    ...diagnostics,
    assessment_state: assessmentStateResult.state,
    evidence_usage_state: evidenceUsageState,
    operator_display_state: operatorDisplay.state,
    operator_state_reason: operatorDisplay.reason,
    operator_state_inputs: operatorDisplay.inputs,
    analyst_flags: [...new Set([...analystFlags, ...assessmentStateResult.analystFlags])],
    specialist_failed: assessmentStateResult.state === 'specialist_failed',
  };
}

/**
 * @param {object} comp
 * @param {object} diagnostics
 * @param {object} ctx
 */
export function deriveAssessmentState(comp, diagnostics, ctx) {
  const analystFlags = [];
  const claimsCount = diagnostics.claims_count ?? 0;
  const scoringUsed = diagnostics.coverage?.scoring_used ?? 0;
  const quarantined = diagnostics.coverage?.quarantined ?? 0;
  const macroContext = diagnostics.coverage?.macro_context ?? 0;
  const excluded = diagnostics.coverage?.excluded_by_scope ?? 0;
  const totalEvidence = scoringUsed + quarantined + macroContext + excluded;

  const severity = comp.severity ?? 'abstain';
  const confidence = comp.confidence ?? 'low';
  const operatorStatus = comp.operator_status ?? null;
  const grounding = comp.narrative_grounding_score ?? comp.grounding_score ?? null;
  const contestedThin = comp.instrument?.contested_thin === true
    || comp.instrument?.contested === true;

  if (claimsCount > 0 && severity === 'abstain' && operatorStatus === 'insufficient_data') {
    analystFlags.push('contract_inconsistent');
    return { state: 'invalid_artifact', analystFlags };
  }

  if (claimsCount > 0) {
    const lowConfidence = confidence === 'low'
      || (grounding != null && grounding < LOW_GROUNDING_THRESHOLD)
      || contestedThin
      || diagnostics.critic_downgraded;
    if (lowConfidence) {
      if (diagnostics.critic_downgraded) analystFlags.push('critic_downgraded');
      return { state: 'assessed_low_confidence', analystFlags };
    }
    return { state: 'assessed', analystFlags };
  }

  if (diagnostics.specialist_ran && claimsCount === 0 && (diagnostics.repair_log?.length > 0 || comp.repair_log?.length > 0)) {
    return { state: 'specialist_failed', analystFlags: ['specialist_output_empty'] };
  }

  if (diagnostics.specialist_ran && claimsCount === 0 && ctx.degradeReason) {
    return { state: 'specialist_failed', analystFlags: ['assessment_degraded'] };
  }

  if (scoringUsed > 0 && !diagnostics.specialist_ran) {
    const reasonFlag = diagnostics.specialist_tier === 'C' ? 'tier_c_skipped' : 'specialist_not_run';
    analystFlags.push(reasonFlag);
    return { state: 'specialist_skipped', analystFlags };
  }

  if (totalEvidence === 0) {
    if (ctx.epistemicProfileAvailable === false && diagnostics.analyst_flags?.includes('diagnostic_incomplete')) {
      return { state: 'insufficient_data', analystFlags: ['diagnostic_incomplete_fallback'] };
    }
    return { state: 'insufficient_data', analystFlags };
  }

  if (quarantined > 0 || macroContext > 0 || excluded > 0) {
    return { state: 'insufficient_data', analystFlags: ['context_only_evidence'] };
  }

  return { state: 'insufficient_data', analystFlags };
}

/**
 * @param {object} part
 * @param {string} assessmentMode
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

/**
 * @param {string} assessmentState
 * @param {string} evidenceUsageState
 * @param {object} diagnostics
 */
export function deriveOperatorDisplayState(assessmentState, evidenceUsageState, diagnostics) {
  const inputs = {
    claims_count: diagnostics.claims_count ?? 0,
    scoring_signal_count: diagnostics.coverage?.scoring_used ?? 0,
    evidence_mass: diagnostics.evidence_mass_scoring_used ?? 0,
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
    const reason = diagnostics.specialist_tier === 'C' && !diagnostics.specialist_selected
      ? 'tier_c_not_in_focus'
      : diagnostics.specialist_tier === 'C'
        ? 'tier_c_skipped'
        : 'specialist_not_run';
    return { state: 'specialist_skipped', reason, inputs };
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

  if (diagnostics.analyst_flags?.includes('diagnostic_incomplete')) {
    return { state: 'insufficient_data', reason: 'diagnostic_incomplete', inputs };
  }

  return { state: 'insufficient_data', reason: 'no_evidence_anywhere', inputs };
}

/**
 * Collect non-canonical component ids across report layers.
 * @param {object} params
 * @returns {string[]}
 */
export function findUnknownComponentIds({
  scoreBySource = {},
  epistemicProfile = null,
  components = [],
}) {
  const ids = new Set();
  for (const sourceBucket of Object.values(scoreBySource)) {
    if (!sourceBucket || typeof sourceBucket !== 'object') continue;
    for (const id of Object.keys(sourceBucket)) ids.add(id);
  }
  for (const id of Object.keys(epistemicProfile?.by_component ?? {})) ids.add(id);
  for (const comp of components) {
    if (comp?.component_id) ids.add(comp.component_id);
  }
  return [...ids].filter((id) => !VALID_COMPONENT_SET.has(id));
}

/**
 * @param {object} assessment
 * @param {object} params
 */
export function attachComponentDiagnostics(assessment, params) {
  const {
    scoring = {},
    scoreBySource = {},
    epistemicProfile = null,
    investigationPlan = null,
  } = params;

  const unknownIds = findUnknownComponentIds({
    scoreBySource,
    epistemicProfile,
    components: assessment.components ?? [],
  });
  if (unknownIds.length > 0) {
    assessment.component_id_warnings = unknownIds;
  }

  const abstentionSet = new Set(investigationPlan?.abstention_components ?? []);
  const focusComponents = investigationPlan?.focus_components ?? [];
  const specialistSelectedSet = buildSpecialistSelectedSet({
    abstentionSet,
    focusComponents,
    epistemicProfile,
  });

  const partitions = buildEvidencePartitionsByComponent({
    signalsForScoring: scoring.signalsForScoring ?? [],
    investigationSignals: scoring.investigationSignals ?? scoring.signalsForScoring ?? [],
    macroSignals: scoring.macroSignals ?? [],
    quarantinedSignals: scoring.scoringPartition?.quarantinedSignals ?? [],
    scopedSignals: scoring.scopedSignals ?? [],
    assessmentMode: scoring.scoringAssessmentMode ?? scoring.assessmentMode ?? assessment.assessment_mode ?? 'normal',
  });

  const degradeReason = assessment.budget_snapshot?.degrade_mode
    ?? assessment.assessment_degraded?.mode
    ?? null;

  const ctx = {
    assessmentMode: scoring.assessmentMode ?? assessment.assessment_mode ?? 'normal',
    epistemicProfileAvailable: Boolean(epistemicProfile?.by_component),
    specialistSelectedSet,
    degradeReason,
  };

  /** @type {Record<string, object>} */
  const componentDiagnosticsIndex = {};
  const components = assessment.components ?? [];
  for (const comp of components) {
    const diag = buildSingleComponentDiagnostics(comp, partitions, ctx);
    componentDiagnosticsIndex[comp.component_id] = diag;
    Object.assign(comp, {
      coverage: diag.coverage,
      assessment_state: diag.assessment_state,
      evidence_usage_state: diag.evidence_usage_state,
      operator_display_state: diag.operator_display_state,
      operator_state_reason: diag.operator_state_reason,
      operator_state_inputs: diag.operator_state_inputs,
      analyst_flags: diag.analyst_flags,
      specialist_tier: comp.specialist_tier ?? diag.specialist_tier,
      specialist_ran: comp.specialist_ran ?? diag.specialist_ran,
    });
  }

  assessment.component_diagnostics = componentDiagnosticsIndex;

  if (Array.isArray(scoring.macroSignals) && scoring.macroSignals.length > 0) {
    assessment.macro_signals = scoring.macroSignals;
  }

  return assessment;
}

/**
 * Attach component diagnostics and assessment-level investigation summary.
 * @param {object} assessment
 * @param {object} params
 */
export function attachInvestigationDiagnostics(assessment, params) {
  attachComponentDiagnostics(assessment, params);
  const scoring = params.scoring ?? {};
  assessment.investigation_summary = buildInvestigationSummary(assessment, {
    investigationSignals: scoring.investigationSignals ?? scoring.signalsForScoring ?? [],
    scoringSignals: scoring.signalsForScoring ?? [],
    shadowScoringAvailable: Boolean(scoring.scoredFull && Object.keys(scoring.scoredFull).length > 0),
    budgetDegradeMode: assessment.budget_snapshot?.degrade_mode ?? null,
  });
  return assessment;
}

/** @deprecated use attachInvestigationDiagnostics */

/**
 * Mirrors selectSpecialistComponents without cross-module import.
 * @param {object} params
 * @returns {Set<string>}
 */
function buildSpecialistSelectedSet({ abstentionSet, focusComponents, epistemicProfile }) {
  const selected = new Set();
  for (const id of COMPONENT_IDS) {
    if (abstentionSet.has(id)) {
      selected.add(id);
      continue;
    }
    if (focusComponents.length === 0 || focusComponents.includes(id)) {
      selected.add(id);
      continue;
    }
    const ep = epistemicProfile?.by_component?.[id] ?? {};
    if (ep.investigation_eligible === true) {
      selected.add(id);
      continue;
    }
    if (!shouldAbstainFromInvestigation(ep)) {
      selected.add(id);
    }
  }
  return selected;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
