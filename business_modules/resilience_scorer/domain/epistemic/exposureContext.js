/**
 * Exposure context — count-based daily stressor summary derived from signals.
 *
 * Pipeline position: assess — computed in the stage runner from the same signal
 * pool the epistemic profile reads; attached to the assessment and to
 * epistemicProfile.assessment_epistemic so narrative/specialist prompts can
 * interpret component evidence RELATIVE to the pressure the community faced
 * (70% school attendance under bombardment is not 70% under mild restrictions).
 *
 * Owns: EXPOSURE_SIGNAL_TYPES and buildExposureContext.
 * Does NOT: score, normalize, or become a ninth component — counts only
 * (min-math); presence-gate rules stay in presenceGates.js.
 *
 * Key collaborators: signalCatalog.js (canonicalizeSignalType),
 * signalInstanceSchema.js (intensity/affected vocab), epistemicProfileBuilder.js.
 */
import { canonicalizeSignalType } from '../contracts/signalCatalog.js';

/** Stressor/exposure signal types summarized into the daily exposure context. */
export const EXPOSURE_SIGNAL_TYPES = Object.freeze([
  'harm_to_population',
  'infrastructure_damage_acute',
  'evacuation_displacement',
  'displacement_resolved',
  'cyber_attack_on_infrastructure',
]);

/** Same ordinal as presenceGates.js INTENSITY_RANK. */
const INTENSITY_RANK = { light: 0, moderate: 1, severe: 2 };

/**
 * Summarize current-day exposure from extracted signals. Counts only.
 *
 * @param {Array<object>} signals extracted signal instances (any scope batch)
 * @returns {{
 *   event_counts: Record<string, number>,
 *   max_intensity: 'light'|'moderate'|'severe'|null,
 *   affected_subgroups: string[],
 *   affected_systems: string[],
 *   total_exposure_signals: number,
 * }}
 */
export function buildExposureContext(signals) {
  const eventCounts = {};
  const subgroups = new Set();
  const systems = new Set();
  let maxRank = -1;
  let total = 0;

  for (const signal of signals ?? []) {
    const type = canonicalizeSignalType(signal?.signal_type ?? signal?.type);
    if (!EXPOSURE_SIGNAL_TYPES.includes(type)) continue;
    total += 1;
    eventCounts[type] = (eventCounts[type] ?? 0) + 1;
    const rank = INTENSITY_RANK[signal?.intensity] ?? null;
    if (rank != null && rank > maxRank) maxRank = rank;
    if (signal?.affected_subgroup) subgroups.add(signal.affected_subgroup);
    if (signal?.affected_system) systems.add(signal.affected_system);
  }

  const maxIntensity = Object.keys(INTENSITY_RANK).find((k) => INTENSITY_RANK[k] === maxRank) ?? null;
  return {
    event_counts: eventCounts,
    max_intensity: maxIntensity,
    affected_subgroups: [...subgroups].sort(),
    affected_systems: [...systems].sort(),
    total_exposure_signals: total,
  };
}
