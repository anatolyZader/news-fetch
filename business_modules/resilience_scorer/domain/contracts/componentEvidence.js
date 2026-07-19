/**
 * Per-component evidence contract — the count-based successor to scored
 * components. All derivations are counts and ratios of counts; there is no
 * evidence mass, no caps, and no numeric resilience score anywhere.
 *
 * Bands:
 * - sufficiency: none | thin | moderate | adequate
 * - balance:     one_sided_pos | one_sided_neg | mixed | contested
 */
import { COMPONENT_IDS } from './componentIds.js';
import { collectComponentSignals } from '../services/signals/componentSignalGroups.js';
import { resolveSignalWeights, defaultSignalWeights } from '../services/signals/signalWeights.js';
import { evaluatePresenceGates } from '../epistemic/presenceGates.js';
import { CRITICAL_BYPASS_SIGNAL_TYPES } from '../epistemic/highSalienceBypass.js';
import { GROUNDING_TIER } from '../services/signals/groundingPolicy.js';

// ── Band thresholds (counts) ────────────────────────────────────────────────
export const SUFFICIENCY = Object.freeze({
  none: 'none', thin: 'thin', moderate: 'moderate', adequate: 'adequate',
});
export const BALANCE = Object.freeze({
  one_sided_pos: 'one_sided_pos',
  one_sided_neg: 'one_sided_neg',
  mixed: 'mixed',
  contested: 'contested',
});

const THIN_MAX_SIGNALS = 2;
const THIN_MAX_ARTICLES = 1;
const ADEQUATE_MIN_SIGNALS = 6;
const ADEQUATE_MIN_ARTICLES = 3;
const ADEQUATE_MIN_SOURCE_TYPES = 2;
const CONTESTED_MINORITY_SHARE = 0.3;
const CONTESTED_MIN_TOTAL = 4;
const OUTLET_CONCENTRATION_SHARE = 0.6;
const SOURCE_TYPE_CONCENTRATION_SHARE = 0.7;

/** @param {{signal_count:number, distinct_articles:number, source_type_count:number}} c */
export function deriveSufficiency({ signal_count, distinct_articles, source_type_count }) {
  if (signal_count === 0) return SUFFICIENCY.none;
  if (signal_count <= THIN_MAX_SIGNALS || distinct_articles <= THIN_MAX_ARTICLES) {
    return SUFFICIENCY.thin;
  }
  if (signal_count >= ADEQUATE_MIN_SIGNALS
    && distinct_articles >= ADEQUATE_MIN_ARTICLES
    && source_type_count >= ADEQUATE_MIN_SOURCE_TYPES) {
    return SUFFICIENCY.adequate;
  }
  return SUFFICIENCY.moderate;
}

/** @param {number} pos @param {number} neg */
export function deriveBalance(pos, neg) {
  const total = pos + neg;
  if (total === 0) return null;
  const minority = Math.min(pos, neg);
  if (minority === 0) return pos > 0 ? BALANCE.one_sided_pos : BALANCE.one_sided_neg;
  if (total >= CONTESTED_MIN_TOTAL && minority / total >= CONTESTED_MINORITY_SHARE) {
    return BALANCE.contested;
  }
  return BALANCE.mixed;
}

function countBy(items, keyFn) {
  const out = {};
  for (const it of items) {
    const k = keyFn(it) ?? '_unknown';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * Count-space concentration flag: one outlet holding most of a component's
 * signals (or one source_type) is worth a sentence in the narrative — nothing
 * is rescaled or removed.
 * @param {Array<{signal: object}>} items
 * @returns {null | { layer: 'article_source'|'source_type', key: string, share: number }}
 */
export function deriveConcentrationWarning(items) {
  const total = items.length;
  if (total < 2) return null;
  for (const [layer, keyFn, threshold] of [
    ['article_source', (it) => it.signal.article_source, OUTLET_CONCENTRATION_SHARE],
    ['source_type', (it) => it.signal.source_type, SOURCE_TYPE_CONCENTRATION_SHARE],
  ]) {
    const byKey = countBy(items, keyFn);
    const keys = Object.keys(byKey);
    if (keys.length <= 1) continue;
    for (const [key, n] of Object.entries(byKey)) {
      const share = n / total;
      if (share > threshold) {
        return { layer, key, share: Math.round(share * 100) / 100 };
      }
    }
  }
  return null;
}

function deriveSalientSingleSignal(items) {
  for (const it of items) {
    const s = it.signal;
    if (s?.grounding_tier !== GROUNDING_TIER.grounded) continue;
    if (CRITICAL_BYPASS_SIGNAL_TYPES.has(it.signalType)) {
      return {
        signal_type: it.signalType,
        evidence_snippet: String(s.evidence ?? '').slice(0, 200) || null,
      };
    }
  }
  return null;
}

function slimSignal(it, index) {
  const s = it.signal;
  return {
    signal_ref: s.signal_id ?? s.id ?? `s${index}`,
    signal_type: it.signalType,
    polarity: it.polarity,
    intensity: s.intensity ?? 'moderate',
    source_type: s.source_type ?? null,
    article_source: s.article_source ?? null,
    grounding_tier: s.grounding_tier ?? null,
    evidence_snippet: String(s.evidence ?? '').slice(0, 300) || null,
  };
}

/**
 * @param {Array<{signal: object, signalType: string, polarity: '+'|'-'}>} items
 * @param {Set} articleSet
 * @param {Set} sourceSet
 * @param {string} componentId
 * @param {string} samplingStatus
 */
function buildOneComponent(items, articleSet, sourceSet, componentId, samplingStatus) {
  const sourceMix = countBy(items, (it) => it.signal.source_type);
  const pos = items.filter((it) => it.polarity === '+').length;
  const neg = items.length - pos;
  const basis = {
    signal_count: items.length,
    distinct_articles: articleSet.size,
    distinct_sources: sourceSet.size,
    positive_count: pos,
    negative_count: neg,
    source_mix: sourceMix,
    sufficiency: deriveSufficiency({
      signal_count: items.length,
      distinct_articles: articleSet.size,
      source_type_count: sourceSet.size,
    }),
    balance: deriveBalance(pos, neg),
    concentration_warning: deriveConcentrationWarning(items),
  };
  const presence = evaluatePresenceGates(componentId, items);
  return {
    component_id: componentId,
    signals: items.map(slimSignal),
    evidence_basis: basis,
    critical_flags: {
      presence_gate: presence.triggered ? presence : null,
      salient_single_signal: deriveSalientSingleSignal(items),
    },
    sampling_status: samplingStatus,
  };
}

/**
 * Build the per-component evidence map for a batch of signals.
 *
 * @param {Array<object>} signals metrics-eligible, scope-partitioned signals
 * @param {object} [ctx]
 * @param {string} [ctx.samplingStatus] 'normal'|'degraded'|'field_anchor_only'|'blind'
 * @param {object|null} [ctx.weightOverlay]
 * @returns {{ by_component: Record<string, object> }}
 */
export function buildComponentEvidence(signals, ctx = {}) {
  const samplingStatus = ctx.samplingStatus ?? 'normal';
  const weights = resolveSignalWeights(defaultSignalWeights(), ctx.weightOverlay ?? null);
  const by_component = {};
  for (const id of COMPONENT_IDS) {
    const { items, articleSet, sourceSet } = collectComponentSignals(id, signals, weights);
    by_component[id] = buildOneComponent(items, articleSet, sourceSet, id, samplingStatus);
  }
  return { by_component };
}
