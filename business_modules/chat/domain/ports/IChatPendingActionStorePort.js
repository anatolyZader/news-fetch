/**
 * @typedef {object} IChatPendingActionStorePort
 * @property {(opts: object) => object} create
 * @property {(id: string) => object | null} get
 * @property {(id: string) => void} delete
 */

export const CHAT_PENDING_ACTION_STORE_PORT = Symbol('IChatPendingActionStorePort');
