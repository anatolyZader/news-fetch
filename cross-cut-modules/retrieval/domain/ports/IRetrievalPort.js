/**
 * Domain port for hybrid RAG retrieval (single platform entry).
 *
 * @typedef {object} IRetrievalPort
 * @property {(query: string, filters?: object) => Promise<Array>} hybridRetrieve
 * @property {(opts: object) => Promise<Array>} searchArchiveChunks
 * @property {(row: object) => Promise<object>} indexArchiveRow
 * @property {() => void} rebuildFts
 * @property {(cutoff: string, types?: string[]) => object} [deleteEphemeralBeforeDate]
 */

export {};
