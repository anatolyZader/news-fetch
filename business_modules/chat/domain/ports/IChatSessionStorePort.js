/**
 * @typedef {object} IChatSessionStorePort
 * @property {(opts: { ownerUid: string, reportDate: string, title?: string }) => string} createSession
 * @property {(opts: { ownerUid: string, reportDate: string }) => object[]} listSessions
 * @property {(sessionId: string) => object | null} getSession
 * @property {(opts: { ownerUid: string, sessionId: string, title: string }) => boolean} renameSession
 * @property {(opts: { ownerUid: string, sessionId: string }) => boolean} deleteSession
 * @property {(opts: { sessionId: string, role: string, content: string, meta?: object | null, hidden?: boolean }) => void} addMessage
 * @property {(opts: { sessionId: string }) => object[]} listMessages
 * @property {(opts: { sessionId: string }) => string | null} getFirstUserMessage
 * @property {(opts: { ownerUid: string, sessionId: string }) => void} touchSession
 */

export const CHAT_SESSION_STORE_PORT = Symbol('IChatSessionStorePort');
