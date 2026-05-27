/**
 * Pure gap engine: given the accumulated structured state, decide whether the
 * report is ready to be drafted, and — if not — which missing fields should
 * drive the next follow-up questions.
 *
 * Code (not the LLM) owns this decision.
 */

import {
  EVIDENCE_REQUIREMENTS as DEFAULT_REQUIREMENTS,
  UNIVERSAL_REQUIRED as DEFAULT_UNIVERSAL_REQUIRED,
  SPREAD_VALUES,
  SOURCE_BASIS_VALUES,
} from './evidenceRequirements.js';

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
  if (OBSERVATION_FIELD_KEYS[field]) {
    const v = obsValue(structuredState, field);
    if (v == null || v === '') return false;
    if (field === 'spread') return ALLOWED_SPREAD.has(v);
    if (field === 'sourceBasis') return ALLOWED_SOURCE_BASIS.has(v);
    return true;
  }

  // Component-specific fields — best-effort heuristic until the structured shape
  // is extended with dedicated per-component slots.
  const behavior = structuredState?.observation?.behavior ?? '';
  const rationales = (structuredState?.componentLinks ?? []).map((l) => l?.rationale ?? '').join(' ');
  const haystack = `${behavior} ${rationales}`.toLowerCase();
  if (!haystack.trim()) return false;
  return behavior.length > 0;
}

function listCandidateComponents(structuredState) {
  const links = Array.isArray(structuredState?.componentLinks) ? structuredState.componentLinks : [];
  return links.map((l) => l?.componentId).filter((id) => id && typeof id === 'string');
}

export function isSufficient(structuredState) {
  for (const f of DEFAULT_UNIVERSAL_REQUIRED) {
    if (!isFieldPresent(structuredState, f)) return false;
  }
  return listCandidateComponents(structuredState).length > 0;
}

function rankGap(gap) {
  const kindScore = { universal: 0, required: 1, disambiguation: 2, optional: 3 }[gap.kind] ?? 9;
  return kindScore;
}

/**
 * @param {object} structuredState
 * @param {object} [opts]
 * @param {object} [opts.requirements]
 * @param {string[]} [opts.universalRequired]
 */
export function computeGaps(structuredState, opts = {}) {
  const requirements = opts.requirements ?? DEFAULT_REQUIREMENTS;
  const universalRequired = opts.universalRequired ?? DEFAULT_UNIVERSAL_REQUIRED;

  const gaps = [];

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

  const candidateIds = listCandidateComponents(structuredState);
  for (const componentId of candidateIds) {
    const req = requirements[componentId];
    if (!req) continue;

    for (const field of req.required) {
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

  gaps.sort((a, b) => rankGap(a) - rankGap(b));

  const sufficient = isSufficient(structuredState);
  return { sufficient, rankedGaps: gaps };
}

export function mergeStructured(prev, next) {
  if (!next || typeof next !== 'object') return prev ?? {};
  const base = prev ?? {};
  const merged = {
    observation: { ...base.observation },
    interpretation: { ...base.interpretation },
    componentLinks: Array.isArray(base.componentLinks) ? [...base.componentLinks] : [],
    confidence: { ...base.confidence },
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
      if (link?.componentId) byId.set(link.componentId, { ...byId.get(link.componentId), ...link });
    }
    merged.componentLinks = Array.from(byId.values());
  }

  if (next.confidence && typeof next.confidence === 'object') {
    if (next.confidence.level) merged.confidence.level = next.confidence.level;
    if (next.confidence.basis) merged.confidence.basis = next.confidence.basis;
  }

  return merged;
}

