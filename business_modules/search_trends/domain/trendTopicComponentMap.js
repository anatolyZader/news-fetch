/**
 * UI labels and display order for the 8 resilience components on the Trends tab.
 * Component values come from signal projection (trendComponentProjection.js), not this file.
 */

/** @type {readonly string[]} */
export const TREND_COMPONENT_ORDER = Object.freeze([
  'narrative',
  'information_communication',
  'lifesaving_behavior',
  'functional_continuity',
  'community_capital',
  'leadership',
  'belonging_solidarity',
  'wellbeing_atrisk',
]);

/** @type {Record<string, string>} */
export const COMPONENT_LABEL_KEYS = Object.freeze({
  narrative: 'comp.narrative',
  information_communication: 'comp.information_communication',
  lifesaving_behavior: 'comp.lifesaving_behavior',
  functional_continuity: 'comp.functional_continuity',
  community_capital: 'comp.community_capital',
  leadership: 'comp.leadership',
  belonging_solidarity: 'comp.belonging_solidarity',
  wellbeing_atrisk: 'comp.wellbeing_atrisk',
});
