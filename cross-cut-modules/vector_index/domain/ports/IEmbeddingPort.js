/**
 * @typedef {object} IEmbeddingPort
 * @property {() => boolean} enabled
 * @property {() => string} getModelId
 * @property {(text: string, opts?: object) => Promise<{ vector: Float32Array, model: string, dim: number }>} embed
 * @property {(texts: string[], opts?: object) => Promise<Array<{ vector: Float32Array, model: string, dim: number }>>} embedBatch
 */

export {};
