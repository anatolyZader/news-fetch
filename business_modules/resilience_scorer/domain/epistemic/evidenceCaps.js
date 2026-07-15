/**
 * Operator epistemic hygiene — source/outlet mass caps (anti echo-chamber).
 *
 * Purpose: prevent any single source type (e.g. all-news), single outlet
 * (e.g. all-ynet), or single PBO settlement from dominating a component's
 * evidence mass and inflating its score. Capping never removes signals —
 * it scales down their `contribution` so the over-represented group's share
 * of total mass drops to a configured threshold.
 *
 * Shape of the data: each item is `{ signal, contribution, polarity }`.
 * Caps operate on `contribution` only; `signal` is read for grouping keys.
 * All caps are applied per polarity ('+' and '-' separately) so trimming a
 * dominant positive source cannot change the sign of the net evidence.
 *
 * Three layers, applied in order by `applySourceCap`:
 *   1. source_type cap  (default 0.5)  — key: signal.source_type
 *   2. article_source cap (default 0.42) — key: signal.article_source (outlet)
 *   3. PBO settlement cap (default 0.45) — key: settlement, PBO signals only
 *
 * Structured collection channels listed in CAP_EXEMPT_SOURCE_TYPES (pbo,
 * field, naftali, …) skip layers 1–2: those feeds are *designed* to dominate
 * regional reports, so their concentration is not an echo-chamber symptom.
 * Layer 3 still redistributes mass *within* PBO by settlement.
 *
 * Downstream: scoring runs once on raw items and once on capped items;
 * the difference feeds `suppression_delta` / `source_cap_binding` on the
 * component (see analyst/scoring/scoreComponentsOrchestrator.js), which in
 * turn drives operator display caveats and narrative suppression compliance.
 */
import { CAP_EXEMPT_SOURCE_TYPES } from '../services/dataVoid/sourceChannels.js';

/** Structured channels (pbo, field, naftali, …) bypass the generic caps. */
function isCapExempt(signal) {
  return CAP_EXEMPT_SOURCE_TYPES.has(signal?.source_type);
}

/** Sum contribution mass per group key (e.g. per source_type or outlet). */
function aggregateMassByKey(polItems, keyFn) {
  const byKey = {};
  for (const it of polItems) {
    const k = keyFn(it.signal);
    byKey[k] = (byKey[k] ?? 0) + it.contribution;
  }
  return byKey;
}

/**
 * Multiply the contribution of every item in one group by `scale`,
 * recording the cumulative factor (`_cap_scale_factor`) and which cap
 * layer touched it (`_cap_layer`) for audit/observability.
 */ 
function scaleKeyContributions(polItems, keyFn, key, scale, layerName) {
  for (const it of polItems) {
    if (keyFn(it.signal) === key) {
      it.contribution *= scale;
      it._cap_scale_factor = (it._cap_scale_factor ?? 1) * scale;
      if (layerName) it._cap_layer = layerName;
    }
  }
}

/**
 * Core cap math for one polarity: any group whose mass share exceeds
 * `threshold` is scaled down so it ends up at exactly `threshold` of the
 * new total. Derivation: with the group's mass at target T and the other
 * groups' mass O unchanged, T / (T + O) = threshold ⇒ T = threshold·O / (1 − threshold).
 * A single-group polarity is left untouched (nothing to rebalance against).
 */
function applyThresholdCapToPolarity(polItems, total, threshold, keyFn, layerName) {
  const byKey = aggregateMassByKey(polItems, keyFn);
  if (Object.keys(byKey).length <= 1) return;

  for (const [key, mass] of Object.entries(byKey)) {
    if (mass / total <= threshold) continue;
    const otherMass = total - mass;
    if (otherMass <= 0) continue;
    const targetMass = (threshold * otherMass) / (1 - threshold);
    scaleKeyContributions(polItems, keyFn, key, targetMass / mass, layerName);
  }
}

/**
 * Generic cap layer: group non-exempt items by `keyFn` and trim any group
 * exceeding `threshold` of its polarity's mass. Exempt items pass through
 * unscaled (but are still returned). Returns fresh item copies — inputs
 * are never mutated. No-op when all cappable items share one key.
 */
export function capByGroup(items, keyFn, threshold, layerName = null) {
  const capItems = items.filter((it) => !isCapExempt(it.signal));
  const exemptItems = items.filter((it) => isCapExempt(it.signal));
  const distinctKeys = new Set(capItems.map((it) => keyFn(it.signal)));
  if (distinctKeys.size <= 1) return items;

  const out = capItems.map((it) => ({ ...it }));
  for (const polarity of ['+', '-']) {
    const polItems = out.filter((it) => it.polarity === polarity);
    const total = polItems.reduce((s, it) => s + it.contribution, 0);
    if (total === 0) continue;
    applyThresholdCapToPolarity(polItems, total, threshold, keyFn, layerName);
  }
  return [...out, ...exemptItems.map((it) => ({ ...it }))];
}

// ── Cap thresholds ──────────────────────────────────────────────────────────

/** Max share of a polarity's mass any one source_type may hold. */
export const DEFAULT_SOURCE_TYPE_CAP = 0.5;
/** Max share any one outlet (article_source) may hold. */
export const DEFAULT_ARTICLE_SOURCE_CAP = 0.42;

/** Threshold from RESILIENCE_SOURCE_TYPE_CAP env (default 0.5). */
function sourceTypeCapThreshold(env = process.env) {
  const raw = Number.parseFloat(env.RESILIENCE_SOURCE_TYPE_CAP ?? '');
  return Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : DEFAULT_SOURCE_TYPE_CAP;
}

/** Threshold from RESILIENCE_ARTICLE_SOURCE_CAP env (default 0.42). */
function articleSourceCapThreshold(env = process.env) {
  const raw = Number.parseFloat(env.RESILIENCE_ARTICLE_SOURCE_CAP ?? '');
  return Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : DEFAULT_ARTICLE_SOURCE_CAP;
}

/** When total evidence mass is very low, relax caps so sparse data isn't over-penalised. */
const ADAPTIVE_SOURCE_TYPE_CAP = 0.8;
const ADAPTIVE_ARTICLE_SOURCE_CAP = 0.6;

/** Evidence mass threshold below which adaptive caps are used. */
const ADAPTIVE_CAP_MASS_THRESHOLD = 5;

// ── Layer 3: PBO per-settlement cap ─────────────────────────────────────────
// PBO/pbo_regional are exempt from layers 1–2 (structured feeds may dominate),
// but within PBO no single settlement should drown out the others.

const PBO_SOURCE_TYPES = new Set(['pbo', 'pbo_regional']);

/** Settlement key from article_source ("pbo-<settlement>" → "<settlement>"). */
function pboSettlementKey(signal) {
  const src = String(signal?.article_source ?? '_unknown');
  return src.replace(/^pbo-/, '') || src;
}

/** Threshold from RESILIENCE_PBO_SETTLEMENT_CAP env (default 0.45). */
function pboSettlementCapThreshold(env = process.env) {
  const raw = Number.parseFloat(env.RESILIENCE_PBO_SETTLEMENT_CAP ?? '0.45');
  return Number.isFinite(raw) && raw > 0 ? raw : 0.45;
}

/**
 * Per-settlement cap for PBO scoring mass (investigation path skips this).
 * Operates only on PBO-family items; everything else passes through.
 * @param {Array<{signal: object, contribution: number, polarity: '+'|'-'}>} items
 * @param {NodeJS.ProcessEnv} [env]
 */
export function applyPboSettlementCap(items, env = process.env) {
  const pboItems = (items ?? []).filter((it) => PBO_SOURCE_TYPES.has(it.signal?.source_type));
  if (pboItems.length <= 1) return items;

  const threshold = pboSettlementCapThreshold(env);
  const out = items.map((it) => ({ ...it }));
  for (const polarity of ['+', '-']) {
    const polItems = out.filter((it) =>
      it.polarity === polarity && PBO_SOURCE_TYPES.has(it.signal?.source_type));
    const total = polItems.reduce((s, it) => s + it.contribution, 0);
    if (total === 0) continue;
    applyThresholdCapToPolarity(polItems, total, threshold, (sig) => pboSettlementKey(sig), 'pbo_settlement');
  }
  return out;
}

/**
 * Main entry — apply all three cap layers in sequence:
 * source_type → article_source → PBO settlement. Later layers see the
 * already-trimmed contributions of earlier ones, so scale factors compound
 * (tracked in `_cap_scale_factor`; `_cap_layer` keeps the last layer applied).
 * When `totalEvidenceMass` < 5 the relaxed adaptive thresholds are used and
 * items are tagged `_adaptive_cap: true`.
 * @param {Array<{signal: object, contribution: number, polarity: '+'|'-'}>} items
 * @param {{ totalEvidenceMass?: number }} [opts]
 *   `totalEvidenceMass` — total absolute evidence mass across all components; when < 5, caps are relaxed.
 */
export function applySourceCap(items, { totalEvidenceMass } = {}) {
  const sparse = typeof totalEvidenceMass === 'number' && totalEvidenceMass < ADAPTIVE_CAP_MASS_THRESHOLD;
  const sourceTypeCap = sparse ? ADAPTIVE_SOURCE_TYPE_CAP : sourceTypeCapThreshold();
  const articleSourceCap = sparse ? ADAPTIVE_ARTICLE_SOURCE_CAP : articleSourceCapThreshold();

  let out = items.map((it) => ({
    ...it,
    _cap_scale_factor: it._cap_scale_factor ?? 1,
    _cap_layer: it._cap_layer ?? null,
    ...(sparse ? { _adaptive_cap: true } : {}),
  }));

  out = capByGroup(out, (sig) => sig.source_type ?? '_unknown', sourceTypeCap, 'source_type');
  out = capByGroup(out, (sig) => sig.article_source ?? '_unknown', articleSourceCap, 'article_source');
  out = applyPboSettlementCap(out);

  return out;
}

/**
 * Convenience wrapper: adaptive cap applied when `totalEvidenceMass < 5`.
 * @param {Array<{signal: object, contribution: number, polarity: '+'|'-'}>} items
 * @param {{ totalEvidenceMass: number }} opts
 */
export function applyAdaptiveSourceCap(items, opts) {
  return applySourceCap(items, opts);
}

/**
 * Whether applySourceCap scaled any item (post vs pre cap mass).
 * NOTE: this is an any-touch test with no materiality threshold — a
 * microscopic trim on one signal returns true. It feeds
 * `source_cap_binding` on the component, which triggers suppression
 * compliance downstream even when `suppression_delta` is 0.
 */
export function sourceCapWasApplied(preItems, postItems) {
  if (preItems.length !== postItems.length) return false;
  for (let i = 0; i < preItems.length; i++) {
    if (Math.abs(preItems[i].contribution - postItems[i].contribution) > 1e-6) return true;
  }
  return false;
}
