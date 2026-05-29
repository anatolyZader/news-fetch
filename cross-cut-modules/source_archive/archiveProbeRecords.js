/**
 * Archive connectivity probe records into source_archive.
 */
import { buildArchiveSourceId } from './sourceId.js';
import { persistOriginalSources } from './persistOriginals.js';

/**
 * @param {ReturnType<import('./createSourceArchive.js').createSourceArchive>} archive
 * @param {Array<object>} records
 * @param {string} date
 * @param {{ moduleRef?: string }} [opts]
 * @returns {number} archived count
 */
export function archiveProbeRecords(archive, records, date, opts = {}) {
  const items = [];
  for (const record of records ?? []) {
    const recordDate = String(record?.date ?? date).trim();
    const body = JSON.stringify(record, null, 2);
    const item = {
      date: recordDate,
      source_type: 'probe',
      source_label: record?.probe_source ?? 'connectivity-probe',
      source_url: null,
      title: `Probe ${record?.region ?? 'national'} (${recordDate})`,
      body,
      published_at: recordDate,
      module_ref: opts.moduleRef ?? null,
    };
    item.source_id = buildArchiveSourceId({
      ...item,
      title: `probe:${record?.probe_source ?? 'manual'}:${recordDate}:${record?.region ?? 'all'}`,
    });
    items.push(item);
  }
  return persistOriginalSources(archive, items).archived;
}
