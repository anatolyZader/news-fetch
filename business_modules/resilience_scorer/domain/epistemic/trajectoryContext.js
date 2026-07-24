/**
 * Trajectory context — count-free day-over-day band comparison per component.
 *
 * Pipeline position: assess — computed in the stage runner from current
 * component evidence bands vs the most recent usable prior daily report
 * (infrastructure/reportHistoryReader loadPriorReports). Resilience is a
 * trajectory, not a snapshot: the label says whether a component's evidence
 * picture is improving, stable, or deteriorating relative to yesterday —
 * it never claims a resilience level.
 *
 * Owns: TRAJECTORY_LABELS and deriveComponentTrajectories (pure).
 * Does NOT: read the filesystem, score, or smooth (no EWMA — min-math).
 *
 * Key collaborators: componentEvidence.js (band vocabulary),
 * reportHistoryReader.js (prior report loading), epistemicProfileBuilder.js
 * (delta_significance stamping).
 */
import { COMPONENT_IDS } from '../contracts/componentIds.js';
import { SUFFICIENCY, BALANCE } from '../contracts/componentEvidence.js';

/** Per-component trajectory labels (ordinal band movement, no numbers). */
export const TRAJECTORY_LABELS = Object.freeze([
  'improving',
  'stable',
  'deteriorating',
  'insufficient_history',
]);

/** Balance band → coarse direction ordinal (worse < mixed < better). */
const BALANCE_ORDINAL = {
  [BALANCE.one_sided_neg]: 0,
  [BALANCE.contested]: 1,
  [BALANCE.mixed]: 1,
  [BALANCE.one_sided_pos]: 2,
};

/** A component observation is usable when it has any primary evidence. */
function usable(entry) {
  return entry != null && entry.sufficiency != null && entry.sufficiency !== SUFFICIENCY.none;
}

/** Normalize one prior report's components[] into { id → {sufficiency, balance, presence} }. */
function priorByComponent(assessment) {
  const out = {};
  for (const comp of assessment?.components ?? []) {
    if (!comp?.component_id) continue;
    out[comp.component_id] = {
      sufficiency: comp.evidence_basis?.sufficiency ?? null,
      balance: comp.evidence_basis?.balance ?? null,
      presence_gate_triggered: comp.presence_gate_triggered
        ?? Boolean(comp.critical_flags?.presence_gate),
    };
  }
  return out;
}

/**
 * Map buildComponentEvidence output → the current-band shape this module compares.
 * @param {Record<string, object>} byComponent buildComponentEvidence().by_component
 * @returns {Record<string, { sufficiency: string|null, balance: string|null, presence_gate_triggered: boolean }>}
 */
export function bandsFromComponentEvidence(byComponent) {
  const out = {};
  for (const [id, comp] of Object.entries(byComponent ?? {})) {
    out[id] = {
      sufficiency: comp?.evidence_basis?.sufficiency ?? null,
      balance: comp?.evidence_basis?.balance ?? null,
      presence_gate_triggered: Boolean(comp?.critical_flags?.presence_gate),
    };
  }
  return out;
}

/** Label one component's movement: presence-gate transitions dominate balance shifts. */
function trajectoryLabel(current, prev) {
  const gateNow = Boolean(current.presence_gate_triggered);
  const gateBefore = Boolean(prev.presence_gate_triggered);
  if (gateNow !== gateBefore) {
    return gateNow ? 'deteriorating' : 'improving';
  }
  const now = BALANCE_ORDINAL[current.balance] ?? null;
  const before = BALANCE_ORDINAL[prev.balance] ?? null;
  if (now == null || before == null || now === before) return 'stable';
  return now > before ? 'improving' : 'deteriorating';
}

/**
 * Compare current bands against the most recent usable prior per component.
 * Rules (ordinal, count-free):
 * - insufficient_history: current has no primary evidence, or no usable prior;
 * - presence gate newly triggered → deteriorating; cleared → improving;
 * - else balance direction moved up → improving, down → deteriorating;
 * - else stable.
 *
 * @param {Record<string, { sufficiency?: string|null, balance?: string|null, presence_gate_triggered?: boolean }>} currentByComponent
 *   Current per-component bands (evidence_basis shape or profile rows).
 * @param {Array<object>} priorAssessments prior daily-report assessment objects, newest first
 * @returns {{ by_component: Record<string, { label: string, prior_date: string|null }>, prior_dates: string[] }}
 */
export function deriveComponentTrajectories(currentByComponent, priorAssessments) {
  const priors = (priorAssessments ?? [])
    .filter(Boolean)
    .map((a) => ({ date: a.report_date ?? a.date ?? null, byComponent: priorByComponent(a) }));

  const by_component = {};
  for (const id of COMPONENT_IDS) {
    const current = currentByComponent?.[id];
    const prior = priors.find((p) => usable(p.byComponent[id]));
    if (!usable(current) || !prior) {
      by_component[id] = { label: 'insufficient_history', prior_date: prior?.date ?? null };
      continue;
    }
    by_component[id] = {
      label: trajectoryLabel(current, prior.byComponent[id]),
      prior_date: prior.date,
    };
  }

  return { by_component, prior_dates: priors.map((p) => p.date).filter(Boolean) };
}
