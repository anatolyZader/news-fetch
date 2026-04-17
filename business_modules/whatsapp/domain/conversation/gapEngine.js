/**
 * Pure gap engine: given the accumulated structured state, decide whether the
 * report is ready to be drafted, and — if not — which missing fields should
 * drive the next follow-up questions.
 *
 * Code (not the LLM) owns this decision.
 *
 * Inputs
 *   structuredState — the shape emitted by the WhatsApp extractor under _structured:
 *     {
 *       observation: {
 *         locality, timeframe, behavior, affectedPopulation,
 *         spread, sourceBasis, comparisonToPrior
 *       },
 *       interpretation: { possibleDrivers[], alternatives[] },
 *       componentLinks: [{ componentId, direction, rationale }],
 *       confidence: { level, basis }
 *     }
 *   turnHistory     — [{ role, text, ts }]
 *   requirements    — EVIDENCE_REQUIREMENTS (per-component config)
 *   universalRequired — UNIVERSAL_REQUIRED
 *
 * Outputs
 *   { sufficient: boolean, rankedGaps: Array<{ componentId, field, kind, reason }> }
 */

import {
  EVIDENCE_REQUIREMENTS as DEFAULT_REQUIREMENTS,
  UNIVERSAL_REQUIRED as DEFAULT_UNIVERSAL_REQUIRED,
  SPREAD_VALUES,
  SOURCE_BASIS_VALUES,
} from '../evidenceRequirements.js';

// ── Observation field keys map ─────────────────────────────────────────────
//
// The universal/required field names use domain terms (observedBehavior,
// locality, sourceBasis, spread). They live under structuredState.observation
// with slightly different keys to avoid redundancy with the containing path.

const OBSERVATION_FIELD_KEYS = {
  observedBehavior: 'behavior',
  locality: 'locality',
  sourceBasis: 'sourceBasis',
  spread: 'spread',
  timeframe: 'timeframe',
  comparisonToPrior: 'comparisonToPrior',
  affectedPopulation: 'affectedPopulation',
};

const ALLOWED_SPREAD = new Set(SPREAD_VALUES);
const ALLOWED_SOURCE_BASIS = new Set(SOURCE_BASIS_VALUES);

function obsValue(structuredState, field) {
  const key = OBSERVATION_FIELD_KEYS[field];
  if (!key) return undefined;
  return structuredState?.observation?.[key];
}

function isFieldPresent(structuredState, field) {
  // Fields that live under observation
  if (OBSERVATION_FIELD_KEYS[field]) {
    const v = obsValue(structuredState, field);
    if (v == null || v === '') return false;
    if (field === 'spread') return ALLOWED_SPREAD.has(v);
    if (field === 'sourceBasis') return ALLOWED_SOURCE_BASIS.has(v);
    return true;
  }
  // Component-specific fields — at present we don't have a per-field slot in
  // structuredState, so we approximate "present" by looking for non-empty
  // mentions anywhere in the observation behavior text or interpretation.
  // A future extension is to add a `componentFields` map to structuredState.
  const behavior = structuredState?.observation?.behavior ?? '';
  const rationales = (structuredState?.componentLinks ?? [])
    .map((l) => l?.rationale ?? '').join(' ');
  const haystack = `${behavior} ${rationales}`.toLowerCase();
  if (!haystack.trim()) return false;
  // Heuristic: treat the field as present if the behavior/rationale text is
  // non-empty. We cannot verify the specific sub-field without richer state.
  return behavior.length > 0;
}

function listCandidateComponents(structuredState) {
  const links = Array.isArray(structuredState?.componentLinks)
    ? structuredState.componentLinks : [];
  return links
    .map((l) => l?.componentId)
    .filter((id) => id && typeof id === 'string');
}

/**
 * Determine whether sufficiency thresholds are met.
 * Hard rules (code-owned, not overridable by the LLM):
 *   - observation.behavior is set
 *   - observation.locality is set
 *   - observation.sourceBasis is set AND in allowed vocabulary
 *   - observation.spread is set AND in allowed vocabulary
 *   - componentLinks has at least one entry
 */
export function isSufficient(structuredState) {
  for (const f of DEFAULT_UNIVERSAL_REQUIRED) {
    if (!isFieldPresent(structuredState, f)) return false;
  }
  if (listCandidateComponents(structuredState).length === 0) return false;
  return true;
}

function rankGap(gap) {
  // Lower score sorts first.
  // Kind priority: universal < component-required < disambiguation < optional
  const kindScore = { universal: 0, required: 1, disambiguation: 2, optional: 3 }[gap.kind] ?? 9;
  return kindScore;
}

/**
 * Compute a ranked list of gaps to close next.
 *
 * @param {object} structuredState
 * @param {object} [opts]
 * @param {object} [opts.requirements]        EVIDENCE_REQUIREMENTS override (for tests).
 * @param {string[]} [opts.universalRequired] UNIVERSAL_REQUIRED override (for tests).
 * @returns {{ sufficient: boolean, rankedGaps: Array<object> }}
 */
export function computeGaps(structuredState, opts = {}) {
  const requirements = opts.requirements ?? DEFAULT_REQUIREMENTS;
  const universalRequired = opts.universalRequired ?? DEFAULT_UNIVERSAL_REQUIRED;

  const gaps = [];

  // 1) Universal required fields
  for (const field of universalRequired) {
    if (!isFieldPresent(structuredState, field)) {
      gaps.push({
        componentId: null,
        field,
        kind: 'universal',
        reason: `חסר שדה בסיסי: ${field}`,
      });
    }
  }

  // 2) Per-candidate-component required + disambiguation
  const candidateIds = listCandidateComponents(structuredState);
  for (const componentId of candidateIds) {
    const req = requirements[componentId];
    if (!req) continue;

    for (const field of req.required) {
      // Skip fields that are already satisfied by the universal pass
      if (universalRequired.includes(field)) continue;
      if (!isFieldPresent(structuredState, field)) {
        gaps.push({
          componentId,
          field,
          kind: 'required',
          reason: `דרוש ל-${componentId}: ${field}`,
        });
      }
    }
    for (const dim of req.disambiguation ?? []) {
      gaps.push({
        componentId,
        field: dim.dimension,
        kind: 'disambiguation',
        reason: `הבחנה דרושה: ${dim.dimension}`,
        values: dim.values,
      });
    }
  }

  // Stable sort by rank
  gaps.sort((a, b) => rankGap(a) - rankGap(b));

  const sufficient = isSufficient(structuredState);
  return { sufficient, rankedGaps: gaps };
}

/**
 * Merge a new partial structured state on top of the accumulated one.
 * New non-null fields overwrite old ones; componentLinks are de-duped by id
 * (latest wins so updated rationale survives).
 */
export function mergeStructured(prev, next) {
  if (!next || typeof next !== 'object') return prev ?? {};
  const base = prev ?? {};
  const merged = {
    observation: { ...(base.observation ?? {}) },
    interpretation: { ...(base.interpretation ?? {}) },
    componentLinks: Array.isArray(base.componentLinks) ? [...base.componentLinks] : [],
    confidence: { ...(base.confidence ?? {}) },
  };

  if (next.observation && typeof next.observation === 'object') {
    for (const [k, v] of Object.entries(next.observation)) {
      if (v == null) continue;
      if (typeof v === 'string' && v.trim() === '') continue;
      merged.observation[k] = v;
    }
  }

  if (next.interpretation && typeof next.interpretation === 'object') {
    if (Array.isArray(next.interpretation.possibleDrivers) && next.interpretation.possibleDrivers.length) {
      merged.interpretation.possibleDrivers = next.interpretation.possibleDrivers;
    }
    if (Array.isArray(next.interpretation.alternatives) && next.interpretation.alternatives.length) {
      merged.interpretation.alternatives = next.interpretation.alternatives;
    }
  }

  if (Array.isArray(next.componentLinks) && next.componentLinks.length) {
    const byId = new Map(merged.componentLinks.map((l) => [l.componentId, l]));
    for (const link of next.componentLinks) {
      if (link?.componentId) byId.set(link.componentId, { ...(byId.get(link.componentId) ?? {}), ...link });
    }
    merged.componentLinks = Array.from(byId.values());
  }

  if (next.confidence && typeof next.confidence === 'object') {
    if (next.confidence.level) merged.confidence.level = next.confidence.level;
    if (next.confidence.basis) merged.confidence.basis = next.confidence.basis;
  }

  return merged;
}
