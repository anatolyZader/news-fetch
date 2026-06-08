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
    if (field === 'locality') {
      const key = structuredState?.observation?.localityKey;
      if (typeof key === 'string' && key.trim()) return true;
    }
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
function collectUniversalGaps(structuredState, universalRequired) {
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
  return gaps;
}

function collectComponentGaps(structuredState, candidateIds, requirements, universalRequired) {
  const gaps = [];
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
  return gaps;
}

export function computeGaps(structuredState, opts = {}) {
  const requirements = opts.requirements ?? DEFAULT_REQUIREMENTS;
  const universalRequired = opts.universalRequired ?? DEFAULT_UNIVERSAL_REQUIRED;
  const candidateIds = listCandidateComponents(structuredState);
  const gaps = [
    ...collectUniversalGaps(structuredState, universalRequired),
    ...collectComponentGaps(structuredState, candidateIds, requirements, universalRequired),
  ];
  gaps.sort((a, b) => rankGap(a) - rankGap(b));
  return { sufficient: isSufficient(structuredState), rankedGaps: gaps };
}

function mergeObservationFields(target, observation) {
  if (!observation || typeof observation !== 'object') return;
  for (const [k, v] of Object.entries(observation)) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    target.observation[k] = v;
  }
}

function mergeInterpretationFields(target, interpretation) {
  if (!interpretation || typeof interpretation !== 'object') return;
  if (Array.isArray(interpretation.possibleDrivers) && interpretation.possibleDrivers.length) {
    target.interpretation.possibleDrivers = interpretation.possibleDrivers;
  }
  if (Array.isArray(interpretation.alternatives) && interpretation.alternatives.length) {
    target.interpretation.alternatives = interpretation.alternatives;
  }
}

function mergeComponentLinks(target, componentLinks) {
  if (!Array.isArray(componentLinks) || !componentLinks.length) return;
  const byId = new Map(target.componentLinks.map((l) => [l.componentId, l]));
  for (const link of componentLinks) {
    if (link?.componentId) byId.set(link.componentId, { ...byId.get(link.componentId), ...link });
  }
  target.componentLinks = Array.from(byId.values());
}

function mergeConfidenceFields(target, confidence) {
  if (!confidence || typeof confidence !== 'object') return;
  if (confidence.level) target.confidence.level = confidence.level;
  if (confidence.basis) target.confidence.basis = confidence.basis;
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

  mergeObservationFields(merged, next.observation);
  mergeInterpretationFields(merged, next.interpretation);
  mergeComponentLinks(merged, next.componentLinks);
  mergeConfidenceFields(merged, next.confidence);

  return merged;
}

