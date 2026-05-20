/**
 * Maps curated Google Trends topics to resilience signal types (weights sum ~1 per topic).
 * Projection to components uses SIGNAL_TO_COMPONENTS in trendComponentProjection.js.
 */

/** @typedef {{ type: string, weight: number }} TrendSignalWeight */

/** @type {Record<string, readonly TrendSignalWeight[]>} */
export const TREND_TOPIC_SIGNALS = Object.freeze({
  alerts: [
    { type: 'early_warning_system_effective', weight: 0.35 },
    { type: 'fear_expression', weight: 0.35 },
    { type: 'compliance_enter_shelter', weight: 0.3 },
  ],
  home_front: [
    { type: 'active_information_seeking', weight: 0.55 },
    { type: 'feedback_channel_open', weight: 0.25 },
    { type: 'compliance_follow_instructions', weight: 0.2 },
  ],
  safe_room: [
    { type: 'household_readiness_demonstrated', weight: 0.5 },
    { type: 'compliance_enter_shelter', weight: 0.5 },
  ],
  evacuation: [
    { type: 'evacuation_displacement', weight: 0.6 },
    { type: 'self_evacuation_unauthorized', weight: 0.4 },
  ],
  schools: [
    { type: 'educational_disruption', weight: 0.65 },
    { type: 'school_psychosocial_support_gap', weight: 0.35 },
  ],
  anxiety: [
    { type: 'fear_expression', weight: 0.7 },
    { type: 'population_survey_finding', weight: 0.3 },
  ],
  mental_support: [
    { type: 'help_seeking_behavior', weight: 0.55 },
    { type: 'school_psychosocial_support_active', weight: 0.45 },
  ],
  resilience: [
    { type: 'future_orientation_hope', weight: 0.5 },
    { type: 'calm_confidence', weight: 0.5 },
  ],
});

/**
 * @param {string} topicId
 * @returns {readonly TrendSignalWeight[]}
 */
export function signalsForTopic(topicId) {
  return TREND_TOPIC_SIGNALS[topicId] ?? [];
}
