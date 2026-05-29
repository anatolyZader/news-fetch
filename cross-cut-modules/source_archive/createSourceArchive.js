/**
 * Facade for the source archive (original full-text store).
 */
import { createSourceArchiveStore } from '../persistence/sourceArchiveStore.js';

/**
 * @param {string} dbPath
 */
export function createSourceArchive(dbPath) {
  const store = createSourceArchiveStore(dbPath);
  return {
    close: () => store.close(),
    upsert: (item, idOpts) => store.upsert(item, idOpts),
    getBySourceId: (sourceId, opts) => store.getBySourceId(sourceId, opts),
    search: (input) => store.search(input),
    listByDate: (date) => store.listByDate(date),
    purgeEphemeralBeforeDate: (cutoff) => store.purgeEphemeralBeforeDate(cutoff),
    purgeBeforeDate: (cutoff) => store.purgeBeforeDate(cutoff),
  };
}
