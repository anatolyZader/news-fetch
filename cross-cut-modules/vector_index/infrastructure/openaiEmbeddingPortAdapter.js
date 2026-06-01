/**
 * OpenAI embeddings as IEmbeddingPort.
 */

import {
  embeddingsEnabled,
  embeddingModelId,
  embedText,
  embedTexts,
} from '../openaiEmbeddingAdapter.js';

/** @type {import('../domain/ports/IEmbeddingPort.js').IEmbeddingPort | null} */
let defaultPort = null;

/**
 * @returns {import('../domain/ports/IEmbeddingPort.js').IEmbeddingPort}
 */
export function createOpenaiEmbeddingPortAdapter() {
  return {
    enabled: embeddingsEnabled,
    getModelId: embeddingModelId,
    embed: embedText,
    embedBatch: embedTexts,
  };
}

/**
 * @returns {import('../domain/ports/IEmbeddingPort.js').IEmbeddingPort}
 */
export function getDefaultEmbeddingPort() {
  if (!defaultPort) {
    defaultPort = createOpenaiEmbeddingPortAdapter();
  }
  return defaultPort;
}
