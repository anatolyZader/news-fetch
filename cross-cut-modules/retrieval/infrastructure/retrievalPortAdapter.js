/**
 * Adapter: exposes retrieval orchestrator as IRetrievalPort.
 */

/**
 * @param {{
 *   retrieval: object,
 *   indexWriter?: object,
 *   indexArchiveRow: (row: object) => Promise<object>,
 *   rebuildFts: () => void,
 *   deleteEphemeralBeforeDate?: (cutoff: string, types?: string[]) => object,
 * }} deps
 * @returns {import('../domain/ports/IRetrievalPort.js').IRetrievalPort}
 */
export function createRetrievalPortAdapter(deps) {
  const { retrieval, indexArchiveRow, rebuildFts, deleteEphemeralBeforeDate } = deps;
  if (!retrieval) throw new Error('createRetrievalPortAdapter: retrieval required');

  return {
    hybridRetrieve(query, filters) {
      return retrieval.hybridRetrieve(query, filters);
    },
    searchArchiveChunks(opts) {
      return retrieval.searchArchiveChunks(opts);
    },
    indexArchiveRow(row) {
      return indexArchiveRow(row);
    },
    rebuildFts() {
      rebuildFts();
    },
    deleteEphemeralBeforeDate(cutoff, types) {
      return deleteEphemeralBeforeDate?.(cutoff, types) ?? { deleted: 0 };
    },
  };
}
