/**
 * Finalize-time component diagnostics: evidence partitions, two-axis states, user display.
 *
 * Pipeline position: assessment finalize — after scoring partition and specialist agent;
 * attaches per-component coverage, assessment_state, and user_display_state.
 *
 * Owns: evidence partition counts per component, diagnostic flags, investigation summary
 * hook-up, unknown component_id warnings.
 * Does NOT: score components, run specialists, or build narrative prose.
 *
 * Key collaborators: `user/userDisplayState.js`, `user/investigationSummary.js`,
 * `signals/routing/signalRouter.js`, `specialist_agents` abstention policy.
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
  deriveUserDisplayState,
} from './userDisplayState.js';

// ── Re-exports ────────────────────────────────────────────────────────────────

export {
  deriveAssessmentState,
  deriveEvidenceUsageState,
  deriveUserDisplayState,
} from './userDisplayState.js';

const VALID_COMPONENT_SET = new Set(COMPONENT_IDS);

// ── Signal counting ───────────────────────────────────────────────────────────

/**
 * Count routed signals belonging to a component (primary + inferred edges).
 *
 * @param {string} componentId
 * @param {Array<object>} signals
 * @param {object} [signalWeights] Defaults to SIGNAL_TO_COMPONENTS.
 * @returns {number}
 */
export function countSignalsForComponent(componentId, signals, signalWeights = SIGNAL_TO_COMPONENTS) {
  const list = Array.isArray(signals) ? signals : [];
  let count = 0;
  for (const signal of list) {
    const signalType = signal.signal_type ?? signal.type;
    const mapping = signalWeights[signalType];
    if (mapping == null || !(componentId in mapping)) continue;
    count += 1;
  }
  return count;
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

  let fieldAnchorUsed = 0;
  if (assessmentMode === 'field_anchor_only' && scoringUsed > 0) {
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
    scoring_used: scoringUsed,
    investigation_used: investigationUsed,
    scoring_quarantined: scoringQuarantined,
    quarantined: quarantined,
    macro_context: macroContext,
    field_anchor_used: fieldAnchorUsed,
    excluded_by_scope: excludedByScope,
  };
}

// ── Evidence partitions ───────────────────────────────────────────────────────

/**
 * Build per-component evidence usage partitions (scoring vs investigation vs quarantine).
 *
 * @param {object} params
 * @param {string[]} [params.componentIds]
 * @param {object[]} [params.signalsForScoring]
 * @param {object[]} [params.investigationSignals]
 * @param {object[]} [params.macroSignals]
 * @param {object[]} [params.quarantinedSignals]
 * @param {object[]} [params.scopedSignals]
 * @param {string} [params.assessmentMode]
 * @param {object} [params.signalWeights]
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
 * Derive full diagnostic record for one component (two-axis states + coverage).
 *
 * @param {object} comp Legacy/v2 merged component.
 * @param {object} partitions From buildEvidencePartitionsByComponent.
 * @param {object} ctx Finalize context (assessmentMode, epistemicProfile, specialist selection).
 * @returns {object}
 */
export function buildSingleComponentDiagnostics(comp, partitions, ctx) {
  const componentId = comp.component_id;
  const part = partitions[componentId] ?? {};
  const claims = comp.narrative_claims ?? comp.claims ?? [];
  const claimsCount = Array.isArray(claims) ? claims.length : 0;
  const developerFlags = [];

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
    developerFlags.push('diagnostic_incomplete');
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
    specialist_selected: specialistSelected,
    specialist_tier: specialistTier,
    specialist_ran: specialistRan,
    specialist_failed: false,
    claims_count: claimsCount,
    critic_downgraded: criticDowngraded,
    degrade_reason: degradeReason,
    developer_flags: developerFlags,
  };

  const assessmentStateResult = deriveAssessmentState(comp, diagnostics, ctx);
  const evidenceUsageState = deriveEvidenceUsageState(part, ctx.assessmentMode);
  const userDisplay = deriveUserDisplayState(
    assessmentStateResult.state,
    evidenceUsageState,
    diagnostics,
  );

  return {
    ...diagnostics,
    assessment_state: assessmentStateResult.state,
    evidence_usage_state: evidenceUsageState,
    user_display_state: userDisplay.state,
    user_state_reason: userDisplay.reason,
    user_state_inputs: userDisplay.inputs,
    developer_flags: [...new Set([...developerFlags, ...assessmentStateResult.developerFlags])],
    specialist_failed: assessmentStateResult.state === 'specialist_failed',
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Collect non-canonical component ids across report layers.
 *
 * @param {object} params
 * @param {Record<string, Record<string, object>>} [params.scoreBySource]
 * @param {object|null} [params.epistemicProfile]
 * @param {object[]} [params.components]
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

// ── Assessment attachment ─────────────────────────────────────────────────────

/**
 * Attach per-component diagnostics and merge display fields onto components.
 *
 * @param {object} assessment
 * @param {object} params
 * @param {object} params.scoring Scoring pipeline output (signals, partition, mode).
 * @param {Record<string, Record<string, object>>} [params.scoreBySource]
 * @param {object|null} [params.epistemicProfile]
 * @param {object|null} [params.investigationPlan]
 * @returns {object}
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
      user_display_state: diag.user_display_state,
      user_state_reason: diag.user_state_reason,
      user_state_inputs: diag.user_state_inputs,
      developer_flags: diag.developer_flags,
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
 * Attach component diagnostics plus assessment-level investigation summary.
 *
 * @param {object} assessment
 * @param {object} params Same shape as attachComponentDiagnostics.
 * @returns {object}
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

// ── Specialist selection mirror ─────────────────────────────────────────────────

/**
 * Mirrors selectSpecialistComponents without cross-module import.
 *
 * @param {object} params
 * @param {Set<string>} params.abstentionSet
 * @param {string[]} params.focusComponents
 * @param {object|null} [params.epistemicProfile]
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
