/**
 * Persist original source rows to the archive (and optionally legacy evidence_items).
 */
import { ensureSourceId } from './sourceId.js';

/**
 * @param {ReturnType<import('./createSourceArchive.js').createSourceArchive>} archive
 * @param {Array<object>} items
 * @param {{ evidenceStore?: { insertItems: (items: unknown[]) => number } | null, idOpts?: (item: object, index: number) => object }} [opts]
 */
export function persistOriginalSources(archive, items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  let archived = 0;
  let evidenceInserted = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const idOpts = opts.idOpts?.(item, i) ?? {};
    const source_id = archive.upsert({ ...item, source_id: item.source_id ?? ensureSourceId(item, idOpts) }, idOpts);
    archived += 1;
    if (opts.evidenceStore && typeof opts.evidenceStore.insertItems === 'function') {
      evidenceInserted += opts.evidenceStore.insertItems([{ ...item, source_id }]);
    }
  }
  return { archived, evidenceInserted };
}
