/**
 * Headline tuning constants (tanhK/certM) — single source of truth.
 * The analyst scoring engine imports these (analyst/ may import
 * domain/epistemic/ per analyst/README.md); do not fork a copy on either side
 * of the quarantine.
 */
export const COMPONENT_TUNING = {
  narrative: { tanhK: 1.8, certM: 1.4 },
  information_communication: { tanhK: 2.5, certM: 2 },
  lifesaving_behavior: { tanhK: 3.2, certM: 2.6 },
  functional_continuity: { tanhK: 2.5, certM: 2 },
  community_capital: { tanhK: 2.2, certM: 1.8 },
  leadership: { tanhK: 2.2, certM: 1.8 },
  belonging_solidarity: { tanhK: 1.8, certM: 1.4 },
  wellbeing_at_risk: { tanhK: 2.5, certM: 2 },
};

export const DEFAULT_TUNING = { tanhK: 2.5, certM: 2 };

/**
 * @param {string} componentId
 * @returns {{ certM: number, tanhK?: number }}
 */
export function certaintyTuningFor(componentId) {
  return COMPONENT_TUNING[componentId] ?? DEFAULT_TUNING;
}
