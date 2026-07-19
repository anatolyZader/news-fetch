/**
 * Finalize-time component diagnostics: evidence partitions, two-axis states, operator display.
 */
import { COMPONENT_IDS } from '../../contracts/componentIds.js';
import { shouldAbstainFromInvestigation } from '../../../../specialist_agents/index.js';
import { narrativeInvestigationPermissive } from '../../contracts/narrativeEpistemicMode.js';
import { FIELD_SOURCE_TYPES } from '../dataVoid/sourceChannels.js';
import { SIGNAL_TO_COMPONENTS } from '../signals/routing/signalRouter.js';
import { buildInvestigationSummary } from './investigationSummary.js';
import {
  deriveAssessmentState,
  deriveEvidenceUsageState,
  deriveOperatorDisplayState,
} from './operatorDisplayState.js';

export {
  deriveAssessmentState,
  deriveEvidenceUsageState,
  deriveOperatorDisplayState,
} from './operatorDisplayState.js';

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
    mass += 1;
  }
  return { count, mass };
}

function buildComponentEvidencePartition(
  componentId,
  {
    signalsForScoring,
    investigationSet,
    scoringQuarantinedSignals,
    quarantinedSignals,
    macroSignals,
    scopedSet,
    metricsSet,
    macroSet,
    assessmentMode,
    signalWeights,
  },
) {
  const scoringUsed = countSignalsForComponent(componentId, signalsForScoring, signalWeights);
  const investigationUsed = countSignalsForComponent(componentId, [...investigationSet], signalWeights);
  const scoringQuarantined = countSignalsForComponent(componentId, scoringQuarantinedSignals, signalWeights);
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

  return {
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
  const partitionCtx = {
    signalsForScoring,
    investigationSet,
    scoringQuarantinedSignals,
    quarantinedSignals,
    macroSignals,
    scopedSet,
    metricsSet,
    macroSet,
    assessmentMode,
    signalWeights,
  };
  for (const componentId of componentIds) {
    out[componentId] = buildComponentEvidencePartition(componentId, partitionCtx);
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
  for (const sourceBucket of Object.values(scoreBySource ?? {})) {
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
    narrativeScopeSignals: scoring.narrativeScopeSignals ?? scoring.scopedSignals ?? [],
    narrativeNationalContext: scoring.narrativeNationalContext ?? [],
    shadowScoringAvailable: Boolean(scoring.scoredFull && Object.keys(scoring.scoredFull).length > 0),
    budgetDegradeMode: assessment.budget_snapshot?.degrade_mode ?? null,
    scoringPartitionApplied: scoring.scoringPartition?.partitionApplied === true,
    scoringAssessmentMode: scoring.scoringAssessmentMode ?? scoring.scoringPartition?.assessmentMode ?? null,
    signalsScoringUsed: (scoring.signalsForScoring ?? []).length,
    priorQuarantineSkipped: scoring.scoringPartition?.priorQuarantineSkipped ?? null,
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
    if (!shouldAbstainFromInvestigation(ep, { narrativePermissive: narrativeInvestigationPermissive() })) {
      selected.add(id);
    }
  }
  return selected;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
