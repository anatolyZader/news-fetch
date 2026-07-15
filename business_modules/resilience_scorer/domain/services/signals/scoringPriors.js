/**
 * Per-type scoring priors — scoring policy owned by the resilience_scorer
 * module. Priors modulate evidence strength (temporal decay, phase fit,
 * intensity floors, quantification expectations); they are not part of the
 * extraction taxonomy in ../../contracts/signalCatalog.js.
 */
import { canonicalizeSignalType } from '../../contracts/signalCatalog.js';

export const DEFAULT_SCORING_PRIORS = {
  expected_phases: ['anticipation', 'response', 'recovery'],
  time_horizon: 'episodic',
  reversibility: 'reversible',
  phase_mismatch_discount: 1,
  temporal_half_life_days: null,
  intensity_floor: null,
  allowed_intensities: ['light', 'moderate', 'severe'],
  expects_quantification: false,
  expected_subgroups: [],
  reliability_override: null,
};

/** @type {Record<string, object>} */
export const SCORING_PRIORS_BY_TYPE = {
  near_miss_reported: { expected_phases: ['response'], temporal_half_life_days: 14 },
  evacuation_displacement: {"expected_phases":["response","recovery"],"time_horizon":"episodic","reversibility":"partial","expects_quantification":true,"temporal_half_life_days":21},
  displacement_resolved: { expected_phases: ['recovery'], temporal_half_life_days: 21 },
  post_event_recovery_indicator: { expected_phases: ['recovery'], temporal_half_life_days: 21 },
  recovery_setback: { expected_phases: ['recovery'], temporal_half_life_days: 21 },
  infrastructure_damage_acute: { expected_phases: ['response', 'recovery'], temporal_half_life_days: 21 },
  connectivity_outage: { expected_subgroups: [], expects_quantification: false },
  volunteer_donor_fatigue: { time_horizon: 'cumulative', temporal_half_life_days: 21 },
  harm_to_population: {"expected_phases":["response","recovery"],"time_horizon":"instant","reversibility":"irreversible","allowed_intensities":["moderate","severe"],"expects_quantification":true,"intensity_floor":"moderate","temporal_half_life_days":30},
  parental_burden: { time_horizon: 'cumulative', temporal_half_life_days: 14 },
  reservist_family_strain: { time_horizon: 'cumulative', temporal_half_life_days: 21 },
  domestic_violence_indicator: {"expected_phases":["response","recovery"],"intensity_floor":"moderate","expects_quantification":false},
  suicide_self_harm_indicator: {"expected_phases":["response","recovery"],"intensity_floor":"moderate","expects_quantification":false},
  population_survey_finding: { expects_quantification: true, allowed_intensities: ['moderate', 'severe'] },
  wellbeing_support_gap: { time_horizon: 'cumulative', temporal_half_life_days: 21 },
  // 15c: episodic disruption/behavior types previously scored stale at full weight.
  service_disruption: { expected_phases: ['response', 'recovery'], temporal_half_life_days: 14 },
  routine_disruption: { temporal_half_life_days: 14 },
  resource_shortage: { temporal_half_life_days: 14 },
  compliance_enter_shelter: { expected_phases: ['response'], temporal_half_life_days: 14 },
  information_actionable_effective: { temporal_half_life_days: 21 },
  public_order_breakdown: { expected_phases: ['response', 'recovery'], temporal_half_life_days: 21 },
  complacency_or_normalization: {"expected_phases":["response","recovery"],"time_horizon":"cumulative","phase_mismatch_discount":0.85,"temporal_half_life_days":14},
  environmental_damage_acute: { expected_phases: ['response', 'recovery'], temporal_half_life_days: 30 },
  hostage_return_event: { expected_phases: ['response', 'recovery'], temporal_half_life_days: 30 },
  hostage_uncertainty_distress: {"expected_phases":["response","recovery"],"time_horizon":"cumulative","temporal_half_life_days":21},
};

/** @param {string} type */
export function getScoringPriors(type) {
  const overrides = SCORING_PRIORS_BY_TYPE[canonicalizeSignalType(type)];
  const merged = { ...DEFAULT_SCORING_PRIORS, ...overrides };
  // Clone nested arrays so callers can never mutate the shared defaults.
  return {
    ...merged,
    expected_phases: [...merged.expected_phases],
    allowed_intensities: [...merged.allowed_intensities],
    expected_subgroups: [...merged.expected_subgroups],
  };
}
