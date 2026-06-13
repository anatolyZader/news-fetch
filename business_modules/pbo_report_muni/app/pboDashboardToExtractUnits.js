/**
 * Map PBO municipality dashboard day data to open-extract units (free text + evidence).
 */
import { normalizeExtractUnits } from '../../signals_extraction/index.js';

/**
 * @param {object} day — getMunicipalityDashboard day entry
 * @param {object} componentNames — { he: Record<string, string> }
 * @param {Map<string, object>} [reviewMetaByMuni]
 * @returns {Array<object>}
 */
function buildMuniExtractLines(muni, componentNames, supplemental) {
  const lines = [];
  for (const [cid, c] of Object.entries(muni.components ?? {})) {
    if (c.avg == null && !(c.texts?.length)) continue;
    const label = componentNames?.he?.[cid] ?? cid;
    const scoreParts = (c.scores ?? []).map((s) => Math.round(s.value * 100) + '%').join(', ');
    const textParts = (c.texts ?? []).filter(Boolean).join(' | ');
    let line = `[${muni.name}] ${label}`;
    if (c.avg != null) line += `: avg=${Math.round(c.avg * 100)}% (${scoreParts})`;
    if (textParts) line += ` — ${textParts}`;
    lines.push(line);
  }
  for (const [cid, text] of Object.entries(supplemental)) {
    const t = String(text ?? '').trim();
    if (!t) continue;
    lines.push(`[${muni.name}] [PBO follow-up ${cid}] ${t}`);
  }
  return lines;
}

export function pboDashboardDayToExtractUnits(day, componentNames, reviewMetaByMuni = new Map()) {
  const units = [];
  let idx = 0;

  for (const muni of day.municipalities ?? []) {
    idx += 1;
    const meta = reviewMetaByMuni.get(muni.name) ?? {};
    const supplemental = meta.supplementalTexts ?? {};
    const lines = buildMuniExtractLines(muni, componentNames, supplemental);
    if (!lines.length) continue;
    units.push({
      title: muni.name,
      source: `pbo-${muni.name}`,
      body: lines.join('\n'),
      article_index: idx,
    });
  }

  return normalizeExtractUnits(units);
}

/**
 * @param {Array<object>} days
 * @param {object} componentNames
 * @param {function(string): Map} loadReviewMeta — (date) => Map
 */
export function pboDashboardDaysToExtractUnits(days, componentNames, loadReviewMeta) {
  const units = [];
  for (const day of days ?? []) {
    const meta = loadReviewMeta ? loadReviewMeta(day.date) : new Map();
    units.push(...pboDashboardDayToExtractUnits(day, componentNames, meta));
  }
  return units;
}
