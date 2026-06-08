/**
 * Enrich epistemic profile for agent investigation (score mass vs investigation mass).
 */
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import { splitInvestigationMassEnabled } from '../../../../cross-cut-modules/agent/agentConfig.js';

const INVESTIGATION_MASS_THRESHOLD = 1.5;
const ARCHIVE_ELIGIBILITY_THRESHOLD = 2;
const RESIDUAL_MASS_UNIT = 0.35;
const ARCHIVE_MASS_UNIT = 0.5;
const OOV_MASS_UNIT = 0.15;

/**
 * Whether planner/specialist should abstain (investigation path).
 * When split disabled, falls back to thin_evidence (legacy).
 * @param {object} ep — epistemicProfile.by_component[id]
 */
export function shouldAbstainFromInvestigation(ep) {
  if (!splitInvestigationMassEnabled()) {
    return ep?.thin_evidence === true;
  }
  if (ep?.investigation_eligible === true) return false;
  return ep?.thin_for_investigation === true || ep?.thin_evidence === true;
}

/**
 * @param {object} profile — computeEpistemicProfile output
 * @param {object} ctx
 */
export function enrichProfileForInvestigation(profile, ctx = {}) {
  if (!profile?.by_component) return profile;

  const {
    scoredComponents = {},
    archiveMentionMass = {},
    residualByComponent = {},
    investigationOovBurst = null,
  } = ctx;

  const byComponent = { ...profile.by_component };

  for (const compId of COMPONENT_IDS) {
    const base = { ...byComponent[compId] };
    const scored = scoredComponents[compId] ?? {};

    base.presence_gate_triggered = scored.presence_gate_triggered === true;
    base.salience_critical = scored.salience_critical === true;
    base.thin_for_scoring = base.thin_evidence === true;

    const archiveMass = archiveMentionMass[compId] ?? 0;
    const residualCount = (residualByComponent[compId] ?? []).length;
    const oovClusterCount = countOovClustersForComponent(investigationOovBurst, compId);

    base.archive_mention_mass = archiveMass;
    base.residual_observation_count = residualCount;
    base.oov_investigation_cluster_count = oovClusterCount;

    const investigationMass = round3(
      (base.evidence_mass ?? 0)
      + archiveMass * ARCHIVE_MASS_UNIT
      + residualCount * RESIDUAL_MASS_UNIT
      + oovClusterCount * OOV_MASS_UNIT,
    );

    base.investigation_mass = investigationMass;
    base.thin_for_investigation = investigationMass < INVESTIGATION_MASS_THRESHOLD;

    base.investigation_eligible = computeInvestigationEligible(base, {
      archiveMass,
      residualCount,
      oovClusterCount,
    });

    byComponent[compId] = base;
  }

  return {
    ...profile,
    by_component: byComponent,
    investigation_enrichment_applied: splitInvestigationMassEnabled(),
  };
}

function computeInvestigationEligible(ep, extras) {
  if (!splitInvestigationMassEnabled()) {
    return !ep.thin_evidence;
  }
  if (ep.presence_gate_triggered || ep.salience_critical) return true;
  if (!ep.thin_for_investigation) return true;
  if (extras.archiveMass >= ARCHIVE_ELIGIBILITY_THRESHOLD) return true;
  if (extras.residualCount > 0) return true;
  if (extras.oovClusterCount > 0) return true;
  if ((ep.media_mention_mass ?? 0) >= 2) return true;
  return false;
}

function countOovClustersForComponent(investigationOovBurst, compId) {
  if (!investigationOovBurst?.top_clusters?.length) return 0;
  let n = 0;
  for (const cluster of investigationOovBurst.top_clusters) {
    const text = `${cluster.label ?? ''} ${(cluster.keywords ?? []).join(' ')}`.toLowerCase();
    if (componentHintMatch(compId, text)) n += 1;
  }
  if (n === 0 && investigationOovBurst.residual_observation_count > 0) {
    return 0;
  }
  return n;
}

function componentHintMatch(compId, text) {
  const hints = {
    leadership: ['mayor', 'municipal', 'leadership', 'government'],
    functional_continuity: ['service', 'infrastructure', 'continuity'],
    lifesaving_behavior: ['shelter', 'safety', 'emergency'],
    wellbeing_at_risk: ['mental', 'trauma', 'wellbeing'],
    information_communication: ['media', 'message', 'communication'],
  };
  const terms = hints[compId] ?? [];
  return terms.some((t) => text.includes(t));
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

export {
  INVESTIGATION_MASS_THRESHOLD,
  ARCHIVE_ELIGIBILITY_THRESHOLD,
};
