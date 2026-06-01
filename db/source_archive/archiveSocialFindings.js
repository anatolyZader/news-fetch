/**
 * Archive social OSINT findings into source_archive.
 */
import { buildArchiveSourceId } from './sourceId.js';
import { persistOriginalSources } from './persistOriginals.js';

function formatFindingBody(finding) {
  const parts = [];
  const quote = String(finding?.quote_original ?? finding?.text ?? '').trim();
  if (quote) parts.push(quote);
  if (finding?.platform) parts.push(`Platform: ${finding.platform}`);
  if (finding?.speaker_role) parts.push(`Role: ${finding.speaker_role}`);
  if (finding?.location) parts.push(`Location: ${finding.location}`);
  if (finding?.behavior_or_emotion) parts.push(`Behavior: ${finding.behavior_or_emotion}`);
  if (finding?.confidence) parts.push(`Confidence: ${finding.confidence}`);
  return parts.join('\n\n');
}

function findingKey(finding) {
  return String(finding?.id ?? finding?.url ?? finding?.dedupeKey ?? '').trim();
}

/**
 * @param {ReturnType<import('./createSourceArchive.js').createSourceArchive>} archive
 * @param {Array<object>} findings
 * @param {string} date YYYY-MM-DD
 * @param {{ moduleRef?: string }} [opts]
 * @returns {{ archived: number, idMap: Map<string, string> }}
 */
export function archiveSocialFindings(archive, findings, date, opts = {}) {
  const list = Array.isArray(findings) ? findings : [];
  const items = [];
  const idMap = new Map();

  for (const finding of list) {
    const body = formatFindingBody(finding);
    if (!body.trim()) continue;
    const item = {
      date,
      source_type: 'social',
      source_url: String(finding?.url ?? '').trim() || null,
      title: [
        finding?.platform ?? 'social',
        finding?.speaker_role ?? finding?.author ?? '',
      ].filter(Boolean).join(': ').trim() || 'Social post',
      source_label: String(finding?.platform ?? 'social'),
      body,
      published_at: String(finding?.date ?? date),
      module_ref: opts.moduleRef ?? null,
    };
    item.source_id = buildArchiveSourceId(item);
    items.push(item);
    const key = findingKey(finding) || item.source_id;
    idMap.set(key, item.source_id);
  }

  const { archived } = persistOriginalSources(archive, items);
  return { archived, idMap };
}

/**
 * Stamp source_id on signals using finding id/url when available.
 * @param {Array<object>} signals
 * @param {Array<object>} findings
 * @param {Map<string, string>} idMap
 */
export function stampSocialSignalSourceIds(signals, findings, idMap) {
  const findingByIndex = findings ?? [];
  return (signals ?? []).map((sig, i) => {
    const finding = findingByIndex[i];
    const key = finding ? findingKey(finding) : '';
    const source_id = (key && idMap.get(key)) || sig.source_id;
    return source_id ? { ...sig, source_id } : sig;
  });
}
