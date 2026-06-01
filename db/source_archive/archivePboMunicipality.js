/**
 * Archive PBO municipality raw data into source_archive.
 */
import { buildArchiveSourceId } from './sourceId.js';
import { persistOriginalSources } from './persistOriginals.js';

/**
 * @param {object} muni
 * @param {string[]} componentsOrder
 * @param {Record<string, Record<string, string>>} componentNames
 * @param {Record<string, string>} [supplementalTexts]
 */
export function formatPboMunicipalityBody(muni, componentsOrder, componentNames, supplementalTexts = {}) {
  const lines = [`# PBO: ${muni.name}`, ''];
  for (const cid of componentsOrder) {
    const c = muni.components?.[cid];
    if (c?.avg == null) continue;
    const label = componentNames?.he?.[cid] ?? componentNames?.en?.[cid] ?? cid;
    const scoreParts = (c.scores ?? []).map((s) => Math.round(s.value * 100) + '%').join(', ');
    const textParts = (c.texts ?? []).filter(Boolean).join(' | ');
    const supplement = String(supplementalTexts[cid] ?? '').trim();
    lines.push(`## ${label}`);
    lines.push(`Average: ${Math.round(c.avg * 100)}% (${scoreParts})`);
    if (textParts) lines.push(`Observations: ${textParts}`);
    if (supplement) lines.push(`Follow-up: ${supplement}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

/**
 * @param {ReturnType<import('./createSourceArchive.js').createSourceArchive>} archive
 * @param {object} day PBO day bundle with municipalities[]
 * @param {string[]} componentsOrder
 * @param {Record<string, Record<string, string>>} componentNames
 * @param {Map<string, object>} [reviewMetaByMuni]
 * @param {{ districtId?: string, sourceFile?: string }} [opts]
 * @returns {{ archived: number, muniMap: Map<string, string> }}
 */
export function archivePboMunicipalityDay(archive, day, componentsOrder, componentNames, reviewMetaByMuni, opts = {}) {
  const items = [];
  const muniMap = new Map();
  const date = day.date;

  for (const muni of day.municipalities ?? []) {
    const meta = reviewMetaByMuni?.get(muni.name) ?? {};
    const supplemental = meta.supplementalTexts ?? {};
    const body = formatPboMunicipalityBody(muni, componentsOrder, componentNames, supplemental);
    if (!body) continue;

    const item = {
      date,
      source_type: 'pbo',
      source_label: opts.districtId ?? 'pbo',
      source_url: null,
      title: `PBO ${muni.name} (${date})`,
      body,
      published_at: date,
      module_ref: opts.sourceFile ?? null,
    };
    item.source_id = buildArchiveSourceId({
      ...item,
      title: `pbo:${muni.name}:${date}`,
    });
    items.push(item);
    muniMap.set(muni.name, item.source_id);
  }

  const { archived } = persistOriginalSources(archive, items);
  return { archived, muniMap };
}

/**
 * @param {Array<object>} signals
 * @param {Map<string, string>} muniMap municipality name → source_id
 */
export function stampPboSignalSourceIds(signals, muniMap) {
  return (signals ?? []).map((sig) => {
    const muni = sig.municipality
      ?? String(sig.article_source ?? '').replace(/^pbo-/, '');
    const source_id = muni && muniMap.get(muni);
    return source_id ? { ...sig, source_id } : sig;
  });
}
