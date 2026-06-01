/**
 * Archive Naftali questionnaire responses into source_archive.
 */
import { buildArchiveSourceId } from './sourceId.js';
import { persistOriginalSources } from './persistOriginals.js';

const SEVERITY_KEYS = [
  'financialRequests', 'schoolMentalHealth', 'communityMentalHealth',
  'parentalStress', 'coupleConflicts', 'parentChildConflicts',
];

function formatResponseBody(resp, weekDate) {
  const lines = [
    `# Naftali questionnaire: ${resp.municipality}`,
    `Week ending: ${weekDate}`,
    '',
  ];
  if (resp.respondent) lines.push(`Respondent: ${resp.respondent}`, '');
  for (const key of SEVERITY_KEYS) {
    if (resp[key]) lines.push(`${key}: ${resp[key]}`);
  }
  if (resp.vulnerable) {
    lines.push('', 'Vulnerable populations:');
    for (const [k, v] of Object.entries(resp.vulnerable)) {
      if (v) lines.push(`- ${k}: ${v}`);
    }
  }
  const textFields = [
    'volunteerInitiatives', 'volunteerNeeds', 'volunteerCoordination',
    'staffShortage', 'mainChallenge', 'urgentNeeds', 'additionalComments',
  ];
  for (const key of textFields) {
    const val = String(resp[key] ?? '').trim();
    if (val) lines.push('', `${key}:`, val);
  }
  return lines.join('\n').trim();
}

/**
 * @param {ReturnType<import('./createSourceArchive.js').createSourceArchive>} archive
 * @param {object} week Naftali week bundle
 * @returns {{ archived: number, responseMap: Map<string, string> }}
 */
export function archiveNaftaliWeek(archive, week) {
  const weekDate = week.dateTo ?? week.dateFrom ?? week.date;
  if (!weekDate) return { archived: 0, responseMap: new Map() };

  const items = [];
  const responseMap = new Map();

  for (const resp of week.responses ?? []) {
    const body = formatResponseBody(resp, weekDate);
    if (!body) continue;
    const item = {
      date: weekDate,
      source_type: 'naftali',
      source_label: 'naftali',
      source_url: null,
      title: `Naftali ${resp.municipality} (${weekDate})`,
      body,
      published_at: resp.date ?? weekDate,
      module_ref: week.file ?? null,
    };
    item.source_id = buildArchiveSourceId({
      ...item,
      title: `naftali:${resp.municipality}:${weekDate}`,
    });
    items.push(item);
    responseMap.set(resp.municipality, item.source_id);
  }

  const { archived } = persistOriginalSources(archive, items);
  return { archived, responseMap };
}

/**
 * @param {Array<object>} signals
 * @param {Map<string, string>} responseMap
 */
export function stampNaftaliSignalSourceIds(signals, responseMap) {
  return (signals ?? []).map((sig) => {
    const muni = sig.municipality
      ?? String(sig.article_source ?? '').replace(/^naftali-/, '');
    const source_id = muni && responseMap.get(muni);
    return source_id ? { ...sig, source_id } : sig;
  });
}
