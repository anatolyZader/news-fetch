/**
 * @typedef {object} IChatPendingActionStorePort
 * @property {(opts: { ownerUid: string, sessionId: string, toolName: string, params: object, summary: string }) => object} createPending
 * @property {(id: string) => object | null} getPending
 * @property {(id: string) => boolean} markConsumed single-use consume; false if already consumed
 * @property {(pending: object) => boolean} isExpired
 */

export const CHAT_PENDING_ACTION_STORE_PORT = Symbol('IChatPendingActionStorePort');
