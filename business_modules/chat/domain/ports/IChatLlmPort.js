/**
 * @typedef {object} IChatLlmPort
 * @property {(systemContext: string, pboLookup: object, messages: object[], send: Function, reportData: object, opts?: object) => Promise<{ assistantText: string, stopReason: string|null }>} streamChatResponse
 * @property {(seedText: string, opts?: object) => Promise<string|null>} generateChatTitle
 * @property {(args: { question: string, answer: string, uiLang?: string }, opts?: object) => Promise<string[]>} [generateChatFollowups]
 * @property {(args: { previousSummary?: string, transcript: string }, opts?: object) => Promise<string|null>} [generateChatSummary]
 */

export const CHAT_LLM_PORT = Symbol('IChatLlmPort');
