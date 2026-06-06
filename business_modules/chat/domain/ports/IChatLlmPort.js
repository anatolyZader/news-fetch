/**
 * @typedef {object} IChatLlmPort
 * @property {(systemContext: string, pboLookup: object, messages: object[], send: Function, reportData: object, opts?: object) => Promise<void>} streamChatResponse
 * @property {(seedText: string, opts?: object) => Promise<string|null>} generateChatTitle
 */

export const CHAT_LLM_PORT = Symbol('IChatLlmPort');
