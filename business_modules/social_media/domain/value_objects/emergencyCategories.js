/**
 * Emergency-related categories for pre-filtered daily social feeds.
 * labelKey values map to client i18n keys under socialMedia.category.*
 */
export const EMERGENCY_CATEGORY_IDS = Object.freeze([
  'alerts_shelter',
  'threat_perception',
  'compliance_behavior',
  'information_trust',
  'community_resilience',
  'distress_fear',
  'other',
]);

/** @type {Record<string, string>} */
export const CATEGORY_LABEL_KEYS = Object.freeze({
  alerts_shelter: 'socialMedia.category.alertsShelter',
  threat_perception: 'socialMedia.category.threatPerception',
  compliance_behavior: 'socialMedia.category.complianceBehavior',
  information_trust: 'socialMedia.category.informationTrust',
  community_resilience: 'socialMedia.category.communityResilience',
  distress_fear: 'socialMedia.category.distressFear',
  other: 'socialMedia.category.other',
});

export const COMPONENT_TO_CATEGORY = Object.freeze({
  lifesaving_behavior: 'alerts_shelter',
  information_communication: 'information_trust',
  community_capital: 'community_resilience',
  narrative: 'distress_fear',
  belonging_solidarity: 'community_resilience',
  leadership: 'information_trust',
  functional_continuity: 'other',
  wellbeing_at_risk: 'distress_fear',
});
