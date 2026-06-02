/**
 * @typedef {object} IEmbeddingPort
 * @property {boolean} enabled
 * @property {() => string} getModelId
 * @property {(text: string) => Promise<number[]>} embed
 * @property {(texts: string[]) => Promise<number[][]>} embedBatch
 */

export {};
