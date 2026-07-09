import { computeSignalClassMix, massBySignalType } from './scoringShared.js';

/** Pre-cap check: would article_source cap bind for any polarity? */
function detectOutletConcentration(items, threshold) {
  if (items.length === 0) return { warning: false, dominantKey: null };
  const distinct = new Set(items.map((it) => it.signal.article_source ?? '_unknown'));
  if (distinct.size <= 1) return { warning: false, dominantKey: null };

  for (const polarity of ['+', '-']) {
    const polItems = items.filter((it) => it.polarity === polarity);
    const total = polItems.reduce((s, it) => s + it.contribution, 0);
    if (total === 0) continue;
    const byKey = {};
    for (const it of polItems) {
      const k = it.signal.article_source ?? '_unknown';
      byKey[k] = (byKey[k] || 0) + it.contribution;
    }
    for (const [key, mass] of Object.entries(byKey)) {
      if (mass / total > threshold) {
        return { warning: true, dominantKey: key };
      }
    }
  }
  return { warning: false, dominantKey: null };
}

function setComplianceParadox(byType, out) {
  out.compliance_paradox =
    (byType.compliance_enter_shelter ?? 0) > 0 && (byType.information_confusion ?? 0) > 0;
}

function setNarrativeWellbeingDissociationForNarrative(byType, out) {
  const posNarr = byType.resilience_narrative_positive ?? 0;
  const distress = (byType.fear_expression ?? 0) + (byType.psychological_distress ?? 0)
    + (byType.child_distress ?? 0);
  out.narrative_wellbeing_dissociation = posNarr > 0 && distress > 0;
}

function setNarrativeWellbeingDissociationForWellbeing(byType, out) {
  const posWell = (byType.positive_wellbeing_marker ?? 0) + (byType.calm_confidence ?? 0);
  const distress = (byType.psychological_distress ?? 0) + (byType.child_distress ?? 0)
    + (byType.fear_expression ?? 0);
  out.narrative_wellbeing_dissociation = posWell > 0 && distress > 0;
}

function setLeadershipNarrativeDivergence(byType, out) {
  const posNarr = (byType.resilience_narrative_positive ?? 0) + (byType.calm_confidence ?? 0);
  out.leadership_narrative_divergence =
    posNarr > 0 && (byType.leadership_absence ?? 0) > 0;
}

function setTrustInformationCascade(byType, out) {
  out.trust_information_cascade =
    (byType.mistrusted_information_source ?? 0) > 0
    && (byType.non_compliance_due_to_distrust ?? 0) > 0;
}

function setRecoveryFragility(byType, out) {
  out.recovery_fragility =
    (byType.post_event_recovery_indicator ?? 0) > 0 && (byType.recovery_setback ?? 0) > 0;
}

function setEquityInformationDoubleGap(byType, out) {
  out.equity_information_double_gap =
    (byType.information_inclusivity_gap ?? 0) > 0
    && (byType.inequitable_resource_access ?? 0) > 0;
}

function setCapacityWithoutBehavior(cappedItems, out) {
  const mix = computeSignalClassMix(cappedItems);
  out.capacity_without_behavior =
    (mix.capacity ?? 0) > 0.5 && (mix.behavior ?? 0) < 0.3 * (mix.capacity ?? 0);
}

function setSolidarityUnderHarm(byType, out) {
  out.solidarity_under_harm =
    (byType.harm_to_population ?? 0) > 0 && (byType.solidarity_help_others ?? 0) > 0;
}

function applyComponentIndicators(componentId, byType, out, cappedItems) {
  switch (componentId) {
    case 'lifesaving_behavior':
      setComplianceParadox(byType, out);
      setTrustInformationCascade(byType, out);
      break;
    case 'narrative':
      setNarrativeWellbeingDissociationForNarrative(byType, out);
      setLeadershipNarrativeDivergence(byType, out);
      break;
    case 'wellbeing_at_risk':
      setNarrativeWellbeingDissociationForWellbeing(byType, out);
      setEquityInformationDoubleGap(byType, out);
      setSolidarityUnderHarm(byType, out);
      break;
    case 'leadership':
      setLeadershipNarrativeDivergence(byType, out);
      break;
    case 'information_communication':
      setTrustInformationCascade(byType, out);
      setEquityInformationDoubleGap(byType, out);
      break;
    case 'functional_continuity':
      setRecoveryFragility(byType, out);
      break;
    case 'community_capital':
      setCapacityWithoutBehavior(cappedItems, out);
      break;
    case 'belonging_solidarity':
      setSolidarityUnderHarm(byType, out);
      break;
    default:
      break;
  }
}

/**
 * Composite indicators (code-side, not LLM vocabulary).
 * @param {string} componentId
 * @param {Array<{signal: object, contribution: number}>} cappedItems
 * @param {Record<string, number>} [batchMassByType] mass by signal_type across entire batch
 */
export function computeDerivedIndicators(componentId, cappedItems, batchMassByType = null) {
  const byType = batchMassByType ?? massBySignalType(cappedItems);
  const out = {
    compliance_paradox: false,
    narrative_wellbeing_dissociation: false,
    leadership_narrative_divergence: false,
    outlet_concentration_warning: false,
    dominant_outlet_key: null,
    trust_information_cascade: false,
    recovery_fragility: false,
    equity_information_double_gap: false,
    capacity_without_behavior: false,
    solidarity_under_harm: false,
  };

  applyComponentIndicators(componentId, byType, out, cappedItems);

  const outletInfo = detectOutletConcentration(cappedItems, 0.35);
  out.outlet_concentration_warning = outletInfo.warning;
  out.dominant_outlet_key = outletInfo.dominantKey;

  return out;
}
