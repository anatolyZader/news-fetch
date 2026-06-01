/**
 * Facade for the source archive (original full-text store).
 */
import { createSourceArchiveStore } from '../persistence/sourceArchiveStore.js';

/**
 * @param {string} dbPath
 * @param {{ retrievalIndexer?: { indexArchiveRow: (row: object) => Promise<unknown> } }} [opts]
 */
export function createSourceArchive(dbPath, opts = {}) {
  const store = createSourceArchiveStore(dbPath);
  const retrievalIndexer = opts.retrievalIndexer ?? null;

  function scheduleIndex(item, sourceId) {
    if (!retrievalIndexer?.indexArchiveRow) return;
    const row = {
      ...item,
      source_id: sourceId,
      date: item.date,
      source_type: item.source_type,
      title: item.title,
      body: item.body,
      source_url: item.source_url ?? item.url,
    };
    void retrievalIndexer.indexArchiveRow(row).catch((err) => {
      console.error(`rag index after archive upsert (${sourceId}):`, err.message);
    });
  }

  return {
    close: () => store.close(),
    upsert(item, idOpts) {
      const sourceId = store.upsert(item, idOpts);
      scheduleIndex(item, sourceId);
      return sourceId;
    },
    getBySourceId: (sourceId, opts) => store.getBySourceId(sourceId, opts),
    search: (input) => store.search(input),
    listByDate: (date) => store.listByDate(date),
    listByDateRange: (input) => store.listByDateRange(input),
    purgeEphemeralBeforeDate: (cutoff) => store.purgeEphemeralBeforeDate(cutoff),
    purgeBeforeDate: (cutoff) => store.purgeBeforeDate(cutoff),
  };
}
