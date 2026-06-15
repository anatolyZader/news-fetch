/**
 * Operator epistemic hygiene — source/outlet mass caps (anti echo-chamber).
 */
import { CAP_EXEMPT_SOURCE_TYPES } from '../services/dataVoid/sourceChannels.js';

function isCapExempt(signal) {
  return CAP_EXEMPT_SOURCE_TYPES.has(signal?.source_type);
}

function aggregateMassByKey(polItems, keyFn) {
  const byKey = {};
  for (const it of polItems) {
    const k = keyFn(it.signal);
    byKey[k] = (byKey[k] ?? 0) + it.contribution;
  }
  return byKey;
}

function scaleKeyContributions(polItems, keyFn, key, scale, layerName) {
  for (const it of polItems) {
    if (keyFn(it.signal) === key) {
      it.contribution *= scale;
      it._cap_scale_factor = (it._cap_scale_factor ?? 1) * scale;
      if (layerName) it._cap_layer = layerName;
    }
  }
}

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

const DEFAULT_SOURCE_TYPE_CAP = 0.5;
const DEFAULT_ARTICLE_SOURCE_CAP = 0.35;

/** When total evidence mass is very low, relax caps so sparse data isn't over-penalised. */
const ADAPTIVE_SOURCE_TYPE_CAP = 0.8;
const ADAPTIVE_ARTICLE_SOURCE_CAP = 0.6;

/** Evidence mass threshold below which adaptive caps are used. */
const ADAPTIVE_CAP_MASS_THRESHOLD = 5;

/**
 * @param {Array<{signal: object, contribution: number, polarity: '+'|'-'}>} items
 * @param {{ totalEvidenceMass?: number }} [opts]
 *   `totalEvidenceMass` — total absolute evidence mass across all components; when < 5, caps are relaxed.
 */
export function applySourceCap(items, { totalEvidenceMass } = {}) {
  const sparse = typeof totalEvidenceMass === 'number' && totalEvidenceMass < ADAPTIVE_CAP_MASS_THRESHOLD;
  const sourceTypeCap = sparse ? ADAPTIVE_SOURCE_TYPE_CAP : DEFAULT_SOURCE_TYPE_CAP;
  const articleSourceCap = sparse ? ADAPTIVE_ARTICLE_SOURCE_CAP : DEFAULT_ARTICLE_SOURCE_CAP;

  let out = items.map((it) => ({
    ...it,
    _cap_scale_factor: it._cap_scale_factor ?? 1,
    _cap_layer: it._cap_layer ?? null,
    ...(sparse ? { _adaptive_cap: true } : {}),
  }));

  out = capByGroup(out, (sig) => sig.source_type ?? '_unknown', sourceTypeCap, 'source_type');
  out = capByGroup(out, (sig) => sig.article_source ?? '_unknown', articleSourceCap, 'article_source');

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

/** Whether applySourceCap scaled any item (post vs pre cap mass). */
export function sourceCapWasApplied(preItems, postItems) {
  if (preItems.length !== postItems.length) return false;
  for (let i = 0; i < preItems.length; i++) {
    if (Math.abs(preItems[i].contribution - postItems[i].contribution) > 1e-6) return true;
  }
  return false;
}
