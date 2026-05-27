/**
 * Apply two-layer source cap.
 *
 * Layer 1 (source-type, 50% threshold): no single `source_type` contributes more
 * than 50% of mass for any polarity when ≥2 source_types are present.
 *
 * Layer 2 (article-source, 35% threshold): no single `article_source` contributes
 * more than 35% of mass for any polarity when ≥2 outlets are present.
 */

function aggregateMassByKey(polItems, keyFn) {
  const byKey = {};
  for (const it of polItems) {
    const k = keyFn(it.signal);
    byKey[k] = (byKey[k] || 0) + it.contribution;
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

/**
 * Cap per-polarity mass attributable to any single bucket above `threshold`.
 * Bucket key is computed from each signal via `keyFn`.
 */
export function capByGroup(items, keyFn, threshold, layerName = null) {
  const distinctKeys = new Set(items.map((it) => keyFn(it.signal)));
  if (distinctKeys.size <= 1) return items;

  const out = items.map((it) => ({ ...it }));
  for (const polarity of ['+', '-']) {
    const polItems = out.filter((it) => it.polarity === polarity);
    const total = polItems.reduce((s, it) => s + it.contribution, 0);
    if (total === 0) continue;
    applyThresholdCapToPolarity(polItems, total, threshold, keyFn, layerName);
  }
  return out;
}

/**
 * @param {Array<{signal: object, contribution: number, polarity: '+'|'-'}>} items
 * @returns {Array<{signal: object, contribution: number, polarity: '+'|'-'}>}
 */
export function applySourceCap(items) {
  let out = items.map((it) => ({
    ...it,
    _cap_scale_factor: it._cap_scale_factor ?? 1,
    _cap_layer: it._cap_layer ?? null,
  }));

  out = capByGroup(out, (sig) => sig.source_type ?? '_unknown', 0.5, 'source_type');
  out = capByGroup(out, (sig) => sig.article_source ?? '_unknown', 0.35, 'article_source');

  return out;
}
