/**
 * Map PBO municipality dashboard day data to extract units (verbal text only).
 */
import { normalizeExtractUnits } from '../../signals_extraction/index.js';

/**
 * @param {object} muni
 * @param {object} componentNames — { he: Record<string, string> }
 * @param {Record<string, string>} supplemental
 */
function buildMuniExtractLines(muni, componentNames, supplemental) {
  const lines = [];
  for (const [cid, c] of Object.entries(muni.components ?? {})) {
    const textParts = (c.texts ?? []).filter(Boolean).join(' | ');
    const supplement = String(supplemental[cid] ?? '').trim();
    if (!textParts && !supplement) continue;
    const label = componentNames?.he?.[cid] ?? cid;
    if (textParts) {
      lines.push(`[${muni.name}] ${label} — ${textParts}`);
    }
    if (supplement) {
      lines.push(`[${muni.name}] [PBO follow-up ${cid}] ${supplement}`);
    }
  }
  for (const [cid, text] of Object.entries(supplemental)) {
    const t = String(text ?? '').trim();
    if (!t) continue;
    const alreadyListed = lines.some((line) => line.includes(`[PBO follow-up ${cid}]`));
    if (alreadyListed) continue;
    lines.push(`[${muni.name}] [PBO follow-up ${cid}] ${t}`);
  }
  return lines;
}

/**
 * @param {object} day — getMunicipalityDashboard day entry
 * @param {object} componentNames — { he: Record<string, string> }
 * @param {Map<string, object>} [reviewMetaByMuni]
 * @returns {Array<object>}
 */
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
