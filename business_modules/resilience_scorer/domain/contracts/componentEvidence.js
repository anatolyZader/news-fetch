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
import { findPresenceGateMatch } from '../epistemic/presenceGates.js';
import {
  UNCLASSIFIED_SOURCE_CLASS,
  isIndependentClass,
  isSelfAssessing,
  sourceClassOf,
} from './sourceIndependence.js';
import { CRITICAL_BYPASS_SIGNAL_TYPES } from '../epistemic/highSalienceBypass.js';
import { GROUNDING_TIER } from '../services/signals/groundingPolicy.js';
import {
  SIGNAL_CATALOG,
  SIGNAL_TO_COMPONENTS,
  canonicalizeSignalType,
} from '../services/signals/routing/signalRouter.js';

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

/** Bucket for items whose key is missing — unattributed, not a concentrating key. */
export const UNKNOWN_KEY = '_unknown';

/** Histogram helper: key → count. */
function countBy(items, keyFn) {
  const out = {};
  for (const it of items) {
    const k = keyFn(it) ?? UNKNOWN_KEY;
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
    // Was `if (Object.keys(byKey).length <= 1) continue`, which silenced the
    // worst case: a component whose evidence is 100% one outlet produced no
    // warning at all. The real exclusion is the unattributed bucket — missing
    // provenance is not a concentrating outlet.
    const known = Object.entries(byKey).filter(([key]) => key !== UNKNOWN_KEY);
    if (known.length === 0) continue;
    for (const [key, n] of known) {
      const share = n / total;
      if (share > threshold) {
        return { layer, key, share: Math.round(share * 100) / 100 };
      }
    }
  }
  return null;
}

/**
 * Who a component's evidence comes from, relative to what it assesses.
 *
 * `concentration_warning` asks whether ONE outlet dominates and therefore goes
 * quiet on a component built from forty municipalities' own reports — no single
 * outlet crosses its threshold while independent corroboration is nil. This
 * asks the other question: how much of the evidence comes from outside the
 * assessed body at all, and how much of it is that body describing itself.
 *
 * Counting only. Nothing is rescaled, reweighted or dropped.
 *
 * @param {string} componentId
 * @param {Array<{signal: object}>} items primary items
 * @returns {null | {by_class: object, self_assessed: boolean, self_reported_share: number,
 *   independent_share: number, unclassified_count: number}}
 */
export function deriveSourceClassExposure(componentId, items) {
  const total = items.length;
  if (total === 0) return null;
  const byClass = countBy(items, (it) => sourceClassOf(it.signal.source_type));
  let selfAssessed = 0;
  let independent = 0;
  for (const [cls, n] of Object.entries(byClass)) {
    if (isSelfAssessing(componentId, cls)) selfAssessed += n;
    if (isIndependentClass(cls)) independent += n;
  }
  const round = (n) => Math.round((n / total) * 100) / 100;
  return {
    by_class: byClass,
    self_assessed: selfAssessed > 0,
    self_reported_share: round(selfAssessed),
    independent_share: round(independent),
    unclassified_count: byClass[UNCLASSIFIED_SOURCE_CLASS] ?? 0,
  };
}

/**
 * PBO municipal-review completeness across a component's primary evidence.
 *
 * `incomplete_share` is a share of the component's TOTAL primary mass, not of
 * its PBO subset: 2 incomplete PBO signals inside 40 primary signals is a 5%
 * quality problem, not a 100% one. Counts only — nothing is removed or rerouted.
 *
 * Signals with no `pbo_review_state` count as `unreviewed`; a legacy
 * `pbo_completeness` field is deliberately ignored, because the pre-2026-06-20
 * extractor wrote `'incomplete'` there for merely-unreviewed municipalities.
 *
 * @param {Array<{signal: object}>} items primary items
 * @returns {null | {pbo_primary_count:number, reviewed_sufficient:number, reviewed_incomplete:number, unreviewed:number, incomplete_share:number}}
 */
export function derivePboReviewCompleteness(items) {
  const pboItems = items.filter((it) => it.signal?.pbo_review_state != null);
  if (pboItems.length === 0) return null;
  const counts = { reviewed_sufficient: 0, reviewed_incomplete: 0, unreviewed: 0 };
  for (const it of pboItems) {
    const state = it.signal.pbo_review_state;
    if (state in counts) counts[state] += 1;
    else counts.unreviewed += 1;
  }
  const reviewedTotal = counts.reviewed_sufficient + counts.reviewed_incomplete;
  return {
    pbo_primary_count: pboItems.length,
    ...counts,
    reviewed_count: reviewedTotal,
    review_coverage_share: Math.round((reviewedTotal / pboItems.length) * 100) / 100,
    // null, not 0. "Nobody reviewed anything" and "reviewers looked and found
    // nothing incomplete" are opposite states, and reporting the first as 0
    // made an absence of data read as a clean bill of health.
    incomplete_share: reviewedTotal === 0 || items.length === 0
      ? null
      : Math.round((counts.reviewed_incomplete / items.length) * 100) / 100,
  };
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

// --- Mirror-context derivation ---
/** Catalog type → its mirror twin (only pairs where both sides exist). */
const MIRROR_BY_TYPE = Object.fromEntries(
  SIGNAL_CATALOG
    .filter((s) => s.mirror)
    .map((s) => [s.type, s.mirror]),
);

/**
 * Mirror twins of this component's primary evidence that exist in the signal
 * pool but have NO routing edge into this component (documented asymmetric
 * mirrors, e.g. wellbeing_support_gap routes to wellbeing while
 * wellbeing_support_accessed anchors on community_capital). Without this note a
 * one-sided balance reads as "no counter-evidence exists" when the counter-side
 * is deliberately anchored elsewhere. Counts only — nothing is rerouted.
 *
 * @param {string} componentId
 * @param {Array<{signalType: string}>} primaryItems this component's primary items
 * @param {Map<string, number>} poolTypeCounts canonical type → count in the full pool
 * @returns {null | { total: number, types: Array<{signal_type: string, count: number, anchor_components: string[]}> }}
 */
function deriveMirrorContext(componentId, primaryItems, poolTypeCounts) {
  const twins = new Map();
  for (const it of primaryItems) {
    const mirror = MIRROR_BY_TYPE[it.signalType];
    if (!mirror || twins.has(mirror)) continue;
    if (SIGNAL_TO_COMPONENTS[mirror]?.[componentId]) continue;
    const count = poolTypeCounts.get(mirror) ?? 0;
    if (count === 0) continue;
    const anchors = Object.entries(SIGNAL_TO_COMPONENTS[mirror] ?? {})
      .filter(([, edge]) => edge?.role === 'primary')
      .map(([cid]) => cid)
      .sort();
    twins.set(mirror, { signal_type: mirror, count, anchor_components: anchors });
  }
  if (twins.size === 0) return null;
  const types = [...twins.values()].sort((a, b) => b.count - a.count);
  return { total: types.reduce((sum, t) => sum + t.count, 0), types };
}

// --- Component assembly ---
/**
 * Compact signal row for report/agent payloads (drops bulky fields).
 *
 * `evidence_type`, `temporal_weight` and `confidence` are carried because
 * `contributorRankKey` reads them: when they were dropped here every candidate
 * tied on the rank key and the stable sort degenerated to input (article) order.
 * `grounding_reason` is carried so the demoted-evidence surface can distinguish
 * "unverifiable against source text" from "verification failed".
 *
 * `article_url` and `article_index` are carried because `buildRefKey` walks
 * article_url → source_file+article_index → article_index → source_type. Without
 * them every slim signal in a component fell through to `<type>@src:pbo`, so the
 * ref registry collapsed hundreds of distinct signals onto a handful of keys and
 * later writes overwrote earlier ones.
 *
 * `confidence` reads the extractor's own field, never `extraction_confidence` —
 * the latter is defaulted to a constant and would reintroduce the tie it fixes.
 */
function slimSignal(it, index) {
  const s = it.signal;
  return {
    signal_ref: s.signal_id ?? s.id ?? `s${index}`,
    signal_type: it.signalType,
    polarity: it.polarity,
    routing_role: it.role ?? 'primary',
    construct_role: it.construct_role ?? null,
    intensity: s.intensity ?? null,
    source_type: s.source_type ?? null,
    article_source: s.article_source ?? null,
    article_url: s.article_url ?? null,
    article_index: s.article_index ?? null,
    scope_level: s.scope_level ?? null,
    grounding_tier: s.grounding_tier ?? null,
    grounding_reason: s.grounding_reason ?? null,
    evidence_type: s.evidence_type ?? null,
    temporal_weight: s.temporal_weight ?? null,
    confidence: typeof s.confidence === 'number' ? s.confidence : null,
    evidence_snippet: String(s.evidence ?? '').slice(0, 300) || null,
    // Corroboration survives event collapse: without this a row that merged
    // four outlets is indistinguishable from a single-outlet report. Spread in
    // only when set — it is absent on almost every row.
    ...(s._event_outlet_count ? { _event_outlet_count: s._event_outlet_count } : {}),
  };
}

/**
 * Assemble one component's evidence object from its collected signal items.
 * Bands and counts come from primary-role items only; inferred items are
 * summarized in inferred_context and kept (labeled) in the signals list.
 * @param {Array<{signal: object, signalType: string, polarity: '+'|'-', role: string}>} items
 * @param {string} componentId
 * @param {string} samplingStatus
 * @param {Map<string, number>} [poolTypeCounts] canonical type → count in the full pool
 */
function buildOneComponent(items, componentId, samplingStatus, poolTypeCounts = new Map()) {
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
    source_class_exposure: deriveSourceClassExposure(componentId, primary),
    review_completeness: derivePboReviewCompleteness(primary),
    mirror_context: deriveMirrorContext(componentId, primary, poolTypeCounts),
    inferred_context: {
      count: inferred.length,
      positive_count: inferredPos,
      negative_count: inferred.length - inferredPos,
    },
  };
  // Gates and salience read primary-only, like every band above. An inferred
  // edge is another component's evidence spilling over; firing the loudest flag
  // in the report on it makes a component read as failing on borrowed grounds.
  const { match: presence, item: gateItem } = findPresenceGateMatch(componentId, primary);
  const signals = items.map(slimSignal);
  if (gateItem) {
    const idx = items.indexOf(gateItem);
    if (idx >= 0) signals[idx].presence_gate_trigger = presence.rule_id;
  }
  return {
    component_id: componentId,
    signals,
    evidence_basis: basis,
    critical_flags: {
      presence_gate: presence.triggered ? presence : null,
      salient_single_signal: deriveSalientSingleSignal(primary),
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
  const poolTypeCounts = new Map();
  for (const s of Array.isArray(signals) ? signals : []) {
    const type = canonicalizeSignalType(s?.signal_type ?? s?.type);
    if (!type) continue;
    poolTypeCounts.set(type, (poolTypeCounts.get(type) ?? 0) + 1);
  }
  const by_component = {};
  const primaryItemsByComponent = {};
  for (const id of COMPONENT_IDS) {
    const { items } = collectComponentSignals(id, signals);
    by_component[id] = buildOneComponent(items, id, samplingStatus, poolTypeCounts);
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
