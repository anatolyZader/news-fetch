/**
 * Minimal article-shaped unit for open-vocabulary extraction prompts.
 */

/**
 * @param {unknown} unit
 * @returns {boolean}
 */
export function isValidExtractUnit(unit) {
  return Boolean(unit && typeof unit === 'object' && String(unit.body ?? '').trim());
}

/**
 * @param {Array<object>} units
 * @returns {Array<object>}
 */
export function normalizeExtractUnits(units) {
  if (!Array.isArray(units)) return [];
  const out = [];
  for (const [i, raw] of units.entries()) {
    if (!raw || typeof raw !== 'object') continue;
    const body = String(raw.body ?? raw.promptBody ?? '').trim();
    if (!body) continue;
    out.push({
      title: raw.title ?? null,
      url: raw.url ?? raw.article_url ?? null,
      source: raw.source ?? raw.article_source ?? null,
      body,
      article_index: Number.isInteger(raw.article_index) ? raw.article_index : i + 1,
      publishedAt: raw.publishedAt ?? raw.published_at ?? null,
      temporal_weight: raw.temporal_weight ?? 1,
    });
  }
  return out;
}
