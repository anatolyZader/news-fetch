/**
 * Tier A/B/C specialist depth for token savings.
 */
import { tieredSpecialistsEnabled } from '../../../../cross-cut-modules/agent/agentConfig.js';

/**
 * @param {object} params
 * @returns {'A'|'B'|'C'}
 */
export function resolveSpecialistTier(params) {
  const {
    componentId,
    epistemicProfile,
    plannerContext = null,
    plan = null,
    abstain = false,
    escalate = false,
    evidenceGraph = null,
    gapClosureTasks = [],
    assignedTasks = [],
  } = params;

  if (abstain) return 'C';

  if (!tieredSpecialistsEnabled()) return 'A';

  const ep = epistemicProfile?.by_component?.[componentId] ?? {};
  const compGraph = evidenceGraph?.by_component?.[componentId] ?? {};
  const allTasks = [...assignedTasks, ...gapClosureTasks];

  const hasOovClaims = (compGraph.claims ?? []).some(
    (c) => (c.epistemic_flags ?? []).includes('oov_cluster')
      || (c.epistemic_flags ?? []).includes('residual_observation'),
  );

  const epInvestigationEligible = ep.investigation_eligible === true;
  const hasResidual = (ep.residual_observation_count ?? 0) > 0
    || (ep.archive_mention_mass ?? 0) >= 2;

  const hasMediaAnomaly = (plannerContext?.media_volume_anomalies ?? []).some(
    (a) => a.component_id === componentId,
  );

  const hasExploreTask = allTasks.some((t) => t.type === 'archive_explore');
  const hasGapTask = gapClosureTasks.length > 0;

  const tierATriggers = (
    escalate
    || hasGapTask
    || hasExploreTask
    || hasMediaAnomaly
    || ep.contested
    || ep.delta_significance?.startsWith('HIGH')
    || ep.presence_gate_triggered
    || ep.salience_critical
    || hasOovClaims
    || hasResidual
  );

  if (tierATriggers) return 'A';

  const inFocus = (plan?.focus_components ?? []).includes(componentId);
  if (inFocus || epInvestigationEligible) return 'B';

  return 'C';
}

/**
 * @param {'A'|'B'|'C'} tier
 */
export function maxRoundsForTier(tier) {
  if (tier === 'A') return 3;
  if (tier === 'B') return 1;
  return 0;
}
