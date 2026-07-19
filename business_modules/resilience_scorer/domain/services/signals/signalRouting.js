/**
 * Signal → component routing weights, roles, and routing validation — scoring
 * policy owned by the resilience_scorer module (the shared taxonomy lives in
 * ../../contracts/signalCatalog.js).
 *
 * Weight scale: weights are directional ROUTING PRIORS in [-1.5, +1.5] — how
 * strongly one instance of a signal type bears on a component, before evidence
 * strength is applied. They are NOT final evidence strength: scoring multiplies
 * each weight by scope × intensity × evidence-type reliability × outlet prior ×
 * temporal decay × phase-mismatch × extraction confidence × grounding tier
 * (see ../../epistemic/massContribution.js) and a duplicate-article discount.
 * |w| ≈ 1 is a direct, primary observation of the component; |w| > 1 is
 * reserved for exceptionally diagnostic signals; |w| < 0.5 is usually a
 * secondary/inferred association (see SIGNAL_ROUTING_ROLES).
 */
import {
  SIGNAL_CATALOG,
  SIGNAL_ALIASES,
  canonicalizeSignalType,
} from '../../contracts/signalCatalog.js';
import { COMPONENT_IDS } from '../../contracts/componentIds.js';

export const SIGNAL_TO_COMPONENTS = {
  accountability_demand_constructive: { leadership: +0.7, information_communication: +0.3 },
  active_information_seeking: { information_communication: +0.7 },
  adaptive_practice: { functional_continuity: +0.8, community_capital: +0.5 },
  agricultural_damage: { functional_continuity: -0.6, community_capital: -0.3 },
  anniversary_distress_uptick: { wellbeing_at_risk: -0.7, narrative: -0.3 },
  blame_narrative: { narrative: -0.8, leadership: -0.3, belonging_solidarity: -0.3 },
  blame_shifting: { leadership: -0.9, narrative: -0.3 },
  bridging_capital_demonstrated: { belonging_solidarity: +0.9, community_capital: +0.5 },
  bridging_capital_failure: { belonging_solidarity: -0.9, community_capital: -0.4 },
  calm_confidence: { narrative: +0.9, wellbeing_at_risk: +0.5 },
  child_distress: { wellbeing_at_risk: -0.9 },
  civic_engagement_constructive: { leadership: +0.8, community_capital: +0.4 },
  civil_society_mobilization: { leadership: +0.5, community_capital: +0.9 },
  commemoration_event_observed: { narrative: +0.5, belonging_solidarity: +0.6 },
  community_volunteering: { community_capital: +1, belonging_solidarity: +0.7, wellbeing_at_risk: +0.5 },
  compensation_blocked: { functional_continuity: -0.7, wellbeing_at_risk: -0.5, leadership: -0.3 },
  compensation_received: { functional_continuity: +0.7, wellbeing_at_risk: +0.4 },
  complacency_or_normalization: { lifesaving_behavior: -0.7, information_communication: -0.4, narrative: -0.3 },
  compliance_enter_shelter: { lifesaving_behavior: +1, leadership: +0.2, belonging_solidarity: +0.2 },
  compliance_follow_instructions: { lifesaving_behavior: +0.9, leadership: +0.3 },
  compliance_norm_enforcement: { lifesaving_behavior: +0.7, belonging_solidarity: +0.5, community_capital: +0.4 },
  compliance_partial: { lifesaving_behavior: +0.6, leadership: +0.2 },
  conflict_or_tension: { belonging_solidarity: -1.1, wellbeing_at_risk: -0.4 },
  conflict_resolution: { community_capital: +0.6, belonging_solidarity: +0.6, leadership: +0.3 },
  consensus_on_priorities: { leadership: +0.5, community_capital: +0.6, narrative: +0.2 },
  coordination_failure: { leadership: -1, community_capital: -0.6, functional_continuity: -0.5 },
  coordination_success: { leadership: +1, community_capital: +0.6, functional_continuity: +0.4 },
  cross_event_learning: { functional_continuity: +0.6, leadership: +0.5, lifesaving_behavior: +0.4 },
  cultural_continuity: { narrative: +0.6, belonging_solidarity: +0.6, functional_continuity: +0.4 },
  cyber_attack_on_infrastructure: { information_communication: -0.9, functional_continuity: -0.6 },
  deepfake_misinformation: { information_communication: -1, narrative: -0.4, leadership: -0.3 },
  connectivity_outage: { functional_continuity: -0.9, information_communication: -0.7, wellbeing_at_risk: -0.3 },
  early_warning_system_effective: { lifesaving_behavior: +0.9, information_communication: +0.5, leadership: +0.3 },
  early_warning_system_failure: { lifesaving_behavior: -1, information_communication: -0.6, leadership: -0.4 },
  institutional_abandonment_perception: { narrative: -0.9, leadership: -0.5, belonging_solidarity: -0.4 },
  population_survey_finding: { wellbeing_at_risk: -0.8, narrative: -0.3 },
  self_evacuation_unauthorized: { functional_continuity: -0.7, wellbeing_at_risk: -0.4, belonging_solidarity: -0.3 },
  delayed_mobilization: { functional_continuity: -0.6, community_capital: -0.5, leadership: -0.4 },
  delegation_empowerment: { leadership: +0.7, community_capital: +0.5, functional_continuity: +0.3 },
  dependency_on_external_aid: { community_capital: -0.5, functional_continuity: -0.3 },
  diaspora_solidarity: { community_capital: +0.7, belonging_solidarity: +0.5, narrative: +0.3 },
  digital_mutual_aid: { community_capital: +0.8, belonging_solidarity: +0.5 },
  displacement_resolved: { functional_continuity: +0.9, wellbeing_at_risk: +0.5, belonging_solidarity: +0.3 },
  dissensus_blocks_action: { leadership: -0.6, community_capital: -0.7, narrative: -0.3 },
  domestic_violence_indicator: { wellbeing_at_risk: -0.9 },
  economic_continuity: { functional_continuity: +0.8, wellbeing_at_risk: +0.4 },
  economic_disruption: { functional_continuity: -0.8, wellbeing_at_risk: -0.4 },
  ecosystem_stress: { functional_continuity: -0.5 }, // 15c: raised past render gate; dropped noise wellbeing edge
  educational_continuity: { functional_continuity: +0.9, wellbeing_at_risk: +0.4 },
  educational_disruption: { functional_continuity: -1, wellbeing_at_risk: -0.5 },
  educational_equity_gap: { wellbeing_at_risk: -0.7, belonging_solidarity: -0.4, functional_continuity: -0.4 },
  environmental_damage_acute: { functional_continuity: -0.7, wellbeing_at_risk: -0.3 },
  equitable_resource_distribution: { wellbeing_at_risk: +0.5, community_capital: +0.4, belonging_solidarity: +0.4 }, // 15c: wellbeing primary, symmetric with mirror
  evacuation_displacement: { functional_continuity: -1, wellbeing_at_risk: -0.6, belonging_solidarity: -0.3 },
  failure_to_adapt: { functional_continuity: -0.7, leadership: -0.4, community_capital: -0.3 },
  fear_expression: { wellbeing_at_risk: -0.7, narrative: -0.3 },
  feedback_channel_blocked: { information_communication: -0.7, leadership: -0.4, community_capital: -0.3 },
  feedback_channel_open: { information_communication: +0.7, leadership: +0.4, community_capital: +0.3 },
  feedback_loop_closure: { leadership: +0.7, information_communication: +0.5 },
  food_security_maintained: { functional_continuity: +0.7, wellbeing_at_risk: +0.4 },
  food_security_stress: { functional_continuity: -0.8, wellbeing_at_risk: -0.6 },
  future_orientation_despair: { narrative: -0.7, wellbeing_at_risk: -0.5 },
  future_orientation_hope: { narrative: +0.7, wellbeing_at_risk: +0.4 },
  harm_to_population: { wellbeing_at_risk: -1.2 },
  help_seeking_behavior: { belonging_solidarity: +0.6, community_capital: +0.4 },
  heroism_overframing: { narrative: -0.5, leadership: -0.2 },
  historical_analogy_frame: { narrative: -0.5, wellbeing_at_risk: -0.3 }, // 15c: narrative edge raised past render gate
  hostage_family_advocacy: { narrative: +0.5, leadership: +0.4, belonging_solidarity: +0.5 },
  hostage_return_event: { narrative: +0.6, wellbeing_at_risk: +0.5, belonging_solidarity: +0.4 },
  hostage_uncertainty_distress: { wellbeing_at_risk: -0.9, narrative: -0.5 },
  hostile_influence_operation: { information_communication: -1.1, narrative: -0.4, leadership: -0.3 },
  household_readiness_demonstrated: { lifesaving_behavior: +0.7, community_capital: +0.3 },
  household_readiness_gap: { lifesaving_behavior: -0.7, wellbeing_at_risk: -0.4 },
  household_strain_economic: { wellbeing_at_risk: -0.7, functional_continuity: -0.4 },
  inequitable_resource_access: { wellbeing_at_risk: -0.8, community_capital: -0.5, belonging_solidarity: -0.4 },
  informal_leadership_emergence: { leadership: +0.8, community_capital: +0.6 },
  information_actionable_effective: { information_communication: +1, lifesaving_behavior: +0.6 },
  information_clarity: { information_communication: +1, lifesaving_behavior: +0.4 },
  information_confusion: { information_communication: -1, leadership: -0.4, lifesaving_behavior: -0.3 },
  information_effectiveness_gap: { information_communication: -1, lifesaving_behavior: -0.5 },
  information_inclusivity_gap: { information_communication: -1, wellbeing_at_risk: -0.5, belonging_solidarity: -0.4 },
  information_inclusivity_present: { information_communication: +1, wellbeing_at_risk: +0.5 },
  information_overload: { information_communication: -0.8, wellbeing_at_risk: -0.3 },
  information_vacuum_post_event: { information_communication: -0.9, leadership: -0.3 },
  infrastructure_damage_acute: { functional_continuity: -1, wellbeing_at_risk: -0.4 },
  innovation_under_constraint: { functional_continuity: +0.7, community_capital: +0.6 },
  institutional_trust: { leadership: +0.9, information_communication: +0.4 },
  inter_group_trust: { belonging_solidarity: +0.8, community_capital: +0.4, leadership: +0.3 },
  interfaith_solidarity: { belonging_solidarity: +0.9, community_capital: +0.4 },
  interfaith_tension: { belonging_solidarity: -0.9, wellbeing_at_risk: -0.3, community_capital: -0.3 },
  international_aid_arrival: { community_capital: +0.6, functional_continuity: +0.5 },
  international_aid_withdrawal: { community_capital: -0.5, functional_continuity: -0.4 },
  interpersonal_trust: { belonging_solidarity: +0.8, leadership: +0.4 },
  language_register_mismatch: { information_communication: -0.8, wellbeing_at_risk: -0.4, belonging_solidarity: -0.3 },
  leadership_absence: { leadership: -1.3, lifesaving_behavior: -0.4 },
  leadership_clear_guidance: { leadership: +1.1, lifesaving_behavior: +0.4 },
  leadership_credibility_loss: { leadership: -1.1, narrative: -0.3 },
  leadership_visible_presence: { leadership: +1 },
  learning_loss_documented: { functional_continuity: -0.6, wellbeing_at_risk: -0.5 },
  lessons_learned_uptake: { functional_continuity: +0.6, leadership: +0.5, lifesaving_behavior: +0.3 },
  local_capacity_demonstrated: { community_capital: +0.9, functional_continuity: +0.4 },
  media_literacy_demonstrated: { information_communication: +0.6, community_capital: +0.5 },
  media_trust: { information_communication: +0.8, narrative: +0.3, leadership: +0.3 },
  memorialization_conflict: { belonging_solidarity: -0.7, narrative: -0.4 },
  meta_information_gap: { information_communication: -0.7, leadership: -0.3 },
  meta_information_present: { information_communication: +0.7, leadership: +0.3 },
  mistrusted_information_source: { information_communication: -0.9, leadership: -0.4, narrative: -0.3 },
  moral_injury_narrative: { narrative: -0.8, wellbeing_at_risk: -0.6 },
  near_miss_reported: { lifesaving_behavior: -0.6, wellbeing_at_risk: -0.5 },
  novel_behavior_observed: { wellbeing_at_risk: -0.35, community_capital: -0.25, information_communication: -0.2 },
  news_avoidance_behavior: { information_communication: -0.6, lifesaving_behavior: -0.3 },
  non_compliance_due_to_distrust: { lifesaving_behavior: -0.9, information_communication: -0.5, leadership: -0.4 },
  non_compliance_exit_early: { lifesaving_behavior: -1.2 },
  non_compliance_ignore_guidelines: { lifesaving_behavior: -1, leadership: -0.3 },
  panic_behavior: { lifesaving_behavior: -0.7, wellbeing_at_risk: -0.8 },
  parental_burden: { wellbeing_at_risk: -0.7, functional_continuity: -0.3 },
  plan_failed_during_event: { lifesaving_behavior: -0.8, leadership: -0.5 },
  plan_tested_during_event: { lifesaving_behavior: +0.7, leadership: +0.4 },
  political_distrust: { leadership: -1, narrative: -0.4, information_communication: -0.3 },
  positive_wellbeing_marker: { wellbeing_at_risk: +0.6, narrative: +0.4 },
  post_event_recovery_indicator: { functional_continuity: +0.7, community_capital: +0.4, narrative: +0.4 },
  preparedness_drill_conducted: { lifesaving_behavior: +0.8, leadership: +0.5, community_capital: +0.4 },
  preparedness_gap_identified: { lifesaving_behavior: -0.8, leadership: -0.5 },
  prosocial_norm_violation: { belonging_solidarity: -0.7, community_capital: -0.5 },
  protection_effective: { lifesaving_behavior: +1, narrative: +0.3, leadership: +0.3 },
  protective_infrastructure_absent: { lifesaving_behavior: -0.9, wellbeing_at_risk: -0.5 },
  protective_infrastructure_present: { lifesaving_behavior: +0.9, functional_continuity: +0.5 },
  psychological_distress: { wellbeing_at_risk: -1 },
  rapid_mobilization: { functional_continuity: +0.6, community_capital: +0.6, leadership: +0.4 },
  recovery_setback: { functional_continuity: -0.9, narrative: -0.3, community_capital: -0.3 },
  religious_coping_practice: { belonging_solidarity: +0.7, narrative: +0.5 },
  reservist_family_strain: { wellbeing_at_risk: -0.8, community_capital: -0.3 },
  // Epoch 2026-07-15b: secondary belonging edge — historically misused for
  // cohesion-decline observations, which must reach the belonging pool too.
  resilience_narrative_negative: { narrative: -1, belonging_solidarity: -0.5 },
  resilience_narrative_positive: { narrative: +1 },
  resource_allocation_opacity: { community_capital: -0.7, leadership: -0.4, wellbeing_at_risk: -0.4 },
  resource_allocation_transparency: { community_capital: +0.7, leadership: +0.4, wellbeing_at_risk: +0.3 },
  resource_mobilization: { community_capital: +1, wellbeing_at_risk: +0.6 },
  public_order_breakdown: { community_capital: -0.6, wellbeing_at_risk: -0.4 },
  resource_shortage: { community_capital: -1, wellbeing_at_risk: -0.8, functional_continuity: -0.5 },
  responder_workforce_strain: { lifesaving_behavior: -0.6, leadership: -0.5, functional_continuity: -0.4 },
  responsibility_avowal: { leadership: +0.8, narrative: +0.3 },
  risk_exposure_behavior: { lifesaving_behavior: -1 },
  risk_trade_off_behavior: { lifesaving_behavior: -0.5, wellbeing_at_risk: -0.4 },
  routine_disruption: { functional_continuity: -0.7, wellbeing_at_risk: -0.3 },
  routine_maintenance: { functional_continuity: +0.9 },
  rumor_correction: { information_communication: +1, narrative: +0.4 },
  rumor_spread: { information_communication: -1.2, narrative: -0.5 },
  scam_wave_during_emergency: { information_communication: -0.6, wellbeing_at_risk: -0.5 },
  school_psychosocial_support_active: { wellbeing_at_risk: +0.6, functional_continuity: +0.4 },
  school_psychosocial_support_gap: { wellbeing_at_risk: -0.6, functional_continuity: -0.3 },
  self_organization: { community_capital: +0.9, belonging_solidarity: +0.6 },
  service_continuity: { functional_continuity: +1 },
  service_disruption: { functional_continuity: -1.5, wellbeing_at_risk: -0.4 },
  sleep_disruption_population: { wellbeing_at_risk: -0.7 },
  social_isolation: { belonging_solidarity: -1, wellbeing_at_risk: -0.8 },
  // Epoch 2026-07-15b: dropped narrative +0.3 — helping acts are not
  // narrative-story evidence and only inflated narrative signal counts.
  solidarity_help_others: { belonging_solidarity: +1, wellbeing_at_risk: +0.7, community_capital: +0.6 },
  substance_use_uptick: { wellbeing_at_risk: -0.6 },
  suicide_self_harm_indicator: { wellbeing_at_risk: -1 },
  supply_chain_disruption: { functional_continuity: -0.9, community_capital: -0.4 },
  symbolic_vs_substantive_action: { leadership: -0.7, narrative: -0.2 },
  system_overload: { functional_continuity: -1, wellbeing_at_risk: -0.6 },
  system_resilience_under_load: { functional_continuity: +1, wellbeing_at_risk: +0.4 },
  trusted_information_source: { information_communication: +0.9, leadership: +0.4, narrative: +0.3 },
  unsafe_gathering: { lifesaving_behavior: -0.9 },
  volunteer_donor_fatigue: { community_capital: -0.7 },
  wellbeing_support_accessed: { community_capital: +0.5, functional_continuity: +0.4 },
  wellbeing_support_gap: { wellbeing_at_risk: -0.8, community_capital: -0.3 },
  workplace_flexibility_response: { functional_continuity: +0.6, wellbeing_at_risk: +0.5 },
};

/**
 * Routing roles: which component edges are direct observations ('primary') vs
 * causal associations ('inferred'). Scoring discounts inferred edges (default
 * ×0.5, env RESILIENCE_INFERRED_ROUTE_DISCOUNT) so secondary routing cannot
 * manufacture cross-component correlation.
 *
 * Rule: the max-|weight| edge(s) of each type are primary. Edges listed in
 * ADDITIONAL_PRIMARY_EDGES are also primary — hand-audited cases where a
 * smaller-weight edge is still a direct observation of that component.
 */
const ADDITIONAL_PRIMARY_EDGES = {
  panic_behavior: ['lifesaving_behavior'],
  social_isolation: ['wellbeing_at_risk'],
  resource_shortage: ['wellbeing_at_risk'],
  food_security_stress: ['wellbeing_at_risk'],
  connectivity_outage: ['information_communication'],
  evacuation_displacement: ['wellbeing_at_risk'],
  moral_injury_narrative: ['wellbeing_at_risk'],
  // "The state forgot us" is a direct observation of leadership trust, not spillover.
  institutional_abandonment_perception: ['leadership'],
};

/** @type {Record<string, Record<string, 'primary'|'inferred'>>} */
export const SIGNAL_ROUTING_ROLES = Object.fromEntries(
  Object.entries(SIGNAL_TO_COMPONENTS).map(([type, mapping]) => {
    const maxAbs = Math.max(...Object.values(mapping).map((w) => Math.abs(w)));
    const extraPrimary = new Set(ADDITIONAL_PRIMARY_EDGES[type] ?? []);
    const roles = Object.fromEntries(Object.entries(mapping).map(([componentId, w]) => [
      componentId,
      Math.abs(w) >= maxAbs - 1e-9 || extraPrimary.has(componentId) ? 'primary' : 'inferred',
    ]));
    return [type, roles];
  }),
);

/**
 * @param {string} signalType
 * @param {string} componentId
 * @returns {'primary'|'inferred'}
 */
export function getRoutingRole(signalType, componentId) {
  return SIGNAL_ROUTING_ROLES[canonicalizeSignalType(signalType)]?.[componentId] ?? 'primary';
}

const MAX_ROUTING_WEIGHT = 1.5;
const CATALOG_BY_TYPE = Object.fromEntries(SIGNAL_CATALOG.map((s) => [s.type, s]));

function checkCatalogEntryPolarity(entry, mapping, warnings) {
  const hasPositive = Object.values(mapping).some((w) => w > 0);
  const hasNegative = Object.values(mapping).some((w) => w < 0);
  if (entry.defaultPolarity === 'positive' && !hasPositive) {
    warnings.push(`${entry.type}: defaultPolarity positive but no positive weight`);
  }
  if (entry.defaultPolarity === 'negative' && !hasNegative) {
    warnings.push(`${entry.type}: defaultPolarity negative but no negative weight`);
  }
}

function checkMappingWeights(type, mapping, componentIds, errors) {
  for (const [componentId, weight] of Object.entries(mapping)) {
    if (!componentIds.has(componentId)) {
      errors.push(`${type}: unknown component id in mapping: ${componentId}`);
    }
    if (!Number.isFinite(weight) || weight === 0) {
      errors.push(`${type}: invalid weight for ${componentId}: ${weight}`);
    } else if (Math.abs(weight) > MAX_ROUTING_WEIGHT) {
      errors.push(`${type}: weight for ${componentId} out of range [-${MAX_ROUTING_WEIGHT}, ${MAX_ROUTING_WEIGHT}]: ${weight}`);
    }
  }
}

function checkIndicatorKind(entry, mapping, errors) {
  const kind = entry.indicator_kind;
  if (kind !== 'response' && kind !== 'capacity') return;
  const w = mapping?.wellbeing_at_risk;
  if (w != null && w > 0) {
    errors.push(`${entry.type}: indicator_kind '${kind}' must not route positively into wellbeing_at_risk (treatment uptake is not evidence of wellbeing)`);
  }
}

function checkRoutingRoles(errors) {
  for (const [type, comps] of Object.entries(ADDITIONAL_PRIMARY_EDGES)) {
    const mapping = SIGNAL_TO_COMPONENTS[type];
    if (!mapping) {
      errors.push(`routing-roles: additional-primary type has no mapping: ${type}`);
      continue;
    }
    for (const componentId of comps) {
      if (!(componentId in mapping)) {
        errors.push(`routing-roles: ${type} marks non-existent edge primary: ${componentId}`);
      }
    }
  }
  for (const [type, roles] of Object.entries(SIGNAL_ROUTING_ROLES)) {
    if (!Object.values(roles).includes('primary')) {
      errors.push(`routing-roles: ${type} has no primary edge`);
    }
  }
}

/**
 * Routing ↔ catalog coherence check (scoring policy side).
 * Errors are contract violations (CI must fail); warnings are advisory.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateSignalRouting() {
  const errors = [];
  const warnings = [];
  const componentIds = new Set(COMPONENT_IDS);
  checkRoutingRoles(errors);
  for (const alias of Object.keys(SIGNAL_ALIASES)) {
    if (SIGNAL_TO_COMPONENTS[alias]) errors.push(`alias must not have a component mapping: ${alias}`);
  }
  for (const entry of SIGNAL_CATALOG) {
    const mapping = SIGNAL_TO_COMPONENTS[entry.type];
    if (!mapping) {
      errors.push(`missing mapping for ${entry.type}`);
      continue;
    }
    checkCatalogEntryPolarity(entry, mapping, warnings);
    checkMappingWeights(entry.type, mapping, componentIds, errors);
    checkIndicatorKind(entry, mapping, errors);
  }
  for (const type of Object.keys(SIGNAL_TO_COMPONENTS)) {
    if (!CATALOG_BY_TYPE[type]) errors.push(`orphan mapping for ${type}`);
  }
  return { errors, warnings };
}

/** Throws if the routing violates its contract with the catalog. */
export function assertValidSignalRouting() {
  const { errors } = validateSignalRouting();
  if (errors.length > 0) {
    throw new Error(`Invalid signal routing:\n${errors.join('\n')}`);
  }
}
