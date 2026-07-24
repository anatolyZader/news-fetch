/**
 * Per-component evidence contract — count-based successor to scored components.
 *
 * Pipeline position: assess path after scope partition / verification. Turns a
 * flat signal list into by_component evidence objects (signals + evidence_basis
 * bands + critical_flags) consumed by epistemic profile, narratives, and agents.
 * Client-safe isomorphic.
 *
 * Owns: sufficiency/balance/concentration band derivation and
 * buildComponentEvidence. All derivations are counts and ratios of counts.
 *
 * Does NOT: compute numeric resilience scores, evidence mass, caps, CI, or EWMA
 * (min-math). Presence-gate evaluation is delegated to presenceGates.js.
 *
 * Bands:
 * - sufficiency: none | thin | moderate | adequate
 * - balance:     one_sided_pos | one_sided_neg | mixed | contested
 *
 * Bands are computed from primary-role routing edges only; inferred (secondary
 * association) edges are reported as inferred_context counts and stay in the
 * signals list labeled with routing_role, but cannot make a component look
 * well-evidenced on their own.
 *
 * Key collaborators: componentSignalGroups.js, signalRouting.js,
 * presenceGates.js, highSalienceBypass.js, evidencePipelinePrep.js.
 */
import { COMPONENT_IDS } from './componentIds.js';
import { collectComponentSignals, articleKeyForSignal } from '../services/signals/componentSignalGroups.js';
import { evaluatePresenceGates } from '../epistemic/presenceGates.js';
import { CRITICAL_BYPASS_SIGNAL_TYPES } from '../epistemic/highSalienceBypass.js';
import { GROUNDING_TIER } from '../services/signals/groundingPolicy.js';

// --- Band thresholds ---
/** Sufficiency band labels (how much evidence a component has). */
export const SUFFICIENCY = Object.freeze({
  none: 'none', thin: 'thin', moderate: 'moderate', adequate: 'adequate',
});
/** Polarity-mix band labels (how one-sided vs contested the evidence is). */
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

// --- Band derivation ---
/**
 * Map raw counts → sufficiency band (none/thin/moderate/adequate).
 * Thin if few signals OR few articles; adequate needs signals + articles +
 * source-type diversity; otherwise moderate.
 * @param {{signal_count:number, distinct_articles:number, source_type_count:number}} c
 * @returns {string}
 */
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

/**
 * Map positive vs negative signal counts → balance band (or null if empty).
 * Contested when minority share is large enough on a non-trivial total.
 * @param {number} pos
 * @param {number} neg
 * @returns {string | null}
 */
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

/** Histogram helper: key → count. */
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

/**
 * First grounded critical-bypass signal in the component pool (if any), for
 * narrative salience when evidence is otherwise thin.
 */
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

// --- Component assembly ---
/** Compact signal row for report/agent payloads (drops bulky fields). */
function slimSignal(it, index) {
  const s = it.signal;
  return {
    signal_ref: s.signal_id ?? s.id ?? `s${index}`,
    signal_type: it.signalType,
    polarity: it.polarity,
    routing_role: it.role ?? 'primary',
    construct_role: it.construct_role ?? null,
    intensity: s.intensity ?? 'moderate',
    source_type: s.source_type ?? null,
    article_source: s.article_source ?? null,
    grounding_tier: s.grounding_tier ?? null,
    evidence_snippet: String(s.evidence ?? '').slice(0, 300) || null,
  };
}

/**
 * Assemble one component's evidence object from its collected signal items.
 * Bands and counts come from primary-role items only; inferred items are
 * summarized in inferred_context and kept (labeled) in the signals list.
 * @param {Array<{signal: object, signalType: string, polarity: '+'|'-', role: string}>} items
 * @param {string} componentId
 * @param {string} samplingStatus
 */
function buildOneComponent(items, componentId, samplingStatus) {
  const primary = items.filter((it) => it.role !== 'inferred');
  const inferred = items.filter((it) => it.role === 'inferred');
  const articleSet = new Set();
  const sourceSet = new Set();
  for (const it of primary) {
    const articleKey = articleKeyForSignal(it.signal);
    if (articleKey != null) articleSet.add(articleKey);
    if (it.signal.source_type) sourceSet.add(it.signal.source_type);
  }
  const sourceMix = countBy(primary, (it) => it.signal.source_type);
  const pos = primary.filter((it) => it.polarity === '+').length;
  const neg = primary.length - pos;
  const inferredPos = inferred.filter((it) => it.polarity === '+').length;
  const basis = {
    signal_count: primary.length,
    distinct_articles: articleSet.size,
    distinct_sources: sourceSet.size,
    positive_count: pos,
    negative_count: neg,
    source_mix: sourceMix,
    construct_role_mix: countBy(primary, (it) => it.construct_role),
    sufficiency: deriveSufficiency({
      signal_count: primary.length,
      distinct_articles: articleSet.size,
      source_type_count: sourceSet.size,
    }),
    balance: deriveBalance(pos, neg),
    concentration_warning: deriveConcentrationWarning(primary),
    inferred_context: {
      count: inferred.length,
      positive_count: inferredPos,
      negative_count: inferred.length - inferredPos,
    },
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

// --- Cross-component overlap ---
/** Presentation cap for the shared-articles list (annotation uses the uncapped sets). */
const MAX_SHARED_ARTICLES = 12;

/**
 * Articles whose PRIMARY evidence feeds 2+ components. One article routed to
 * three components must read as shared coverage, not three independent
 * corroborations — this makes that visible.
 *
 * @param {Record<string, Array<{signal: object}>>} primaryItemsByComponent
 * @returns {{
 *   summary: { shared_articles: Array<{article_key: string|number, components: string[], signal_count: number}>, shared_article_total: number, components_involved: string[] },
 *   sharedKeysByComponent: Map<string, Set<string|number>>,
 * }}
 */
function deriveCrossComponentOverlap(primaryItemsByComponent) {
  const byArticle = new Map();
  for (const [componentId, items] of Object.entries(primaryItemsByComponent)) {
    for (const it of items) {
      const key = articleKeyForSignal(it.signal);
      if (key == null) continue;
      const entry = byArticle.get(key) ?? { components: new Set(), signal_count: 0 };
      entry.components.add(componentId);
      entry.signal_count += 1;
      byArticle.set(key, entry);
    }
  }

  const shared = [...byArticle.entries()]
    .filter(([, e]) => e.components.size >= 2)
    .sort(([ka, a], [kb, b]) => (b.components.size - a.components.size)
      || (b.signal_count - a.signal_count)
      || String(ka).localeCompare(String(kb)));

  const sharedKeysByComponent = new Map();
  const componentsInvolved = new Set();
  for (const [key, entry] of shared) {
    for (const id of entry.components) {
      componentsInvolved.add(id);
      if (!sharedKeysByComponent.has(id)) sharedKeysByComponent.set(id, new Set());
      sharedKeysByComponent.get(id).add(key);
    }
  }

  return {
    summary: {
      shared_articles: shared.slice(0, MAX_SHARED_ARTICLES).map(([article_key, e]) => ({
        article_key,
        components: [...e.components].sort(),
        signal_count: e.signal_count,
      })),
      shared_article_total: shared.length,
      components_involved: [...componentsInvolved].sort(),
    },
    sharedKeysByComponent,
  };
}

/**
 * Build the per-component evidence map for a batch of signals.
 * Iterates all COMPONENT_IDS so every component appears even with zero signals.
 *
 * @param {Array<object>} signals metrics-eligible, scope-partitioned signals
 * @param {object} [ctx]
 * @param {string} [ctx.samplingStatus] 'normal'|'degraded'|'field_anchor_only'|'blind'
 * @returns {{ by_component: Record<string, object>, cross_component_overlap: object }}
 */
export function buildComponentEvidence(signals, ctx = {}) {
  const samplingStatus = ctx.samplingStatus ?? 'normal';
  const by_component = {};
  const primaryItemsByComponent = {};
  for (const id of COMPONENT_IDS) {
    const { items } = collectComponentSignals(id, signals);
    by_component[id] = buildOneComponent(items, id, samplingStatus);
    primaryItemsByComponent[id] = items.filter((it) => it.role !== 'inferred');
  }

  const { summary, sharedKeysByComponent } = deriveCrossComponentOverlap(primaryItemsByComponent);
  for (const id of COMPONENT_IDS) {
    const basis = by_component[id].evidence_basis;
    const sharedCount = sharedKeysByComponent.get(id)?.size ?? 0;
    basis.shared_primary_articles = {
      count: sharedCount,
      share: basis.distinct_articles > 0
        ? Math.round((sharedCount / basis.distinct_articles) * 100) / 100
        : null,
    };
  }

  return { by_component, cross_component_overlap: summary };
}
