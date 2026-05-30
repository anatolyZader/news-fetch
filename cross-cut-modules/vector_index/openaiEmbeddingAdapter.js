/**
 * Minimal embedding adapter (OpenAI API) used by local vector index.
 *
 * Design goals:
 * - Reuse existing env conventions in this repo (OPENAI_API_KEY, RESILIENCE_EMBEDDING_API_KEY).
 * - Keep provider-specific code isolated so other embeddings can be swapped in.
 */
 
const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIM_HINT = 1536;
 
function apiKey() {
  return process.env.RESILIENCE_EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
}
 
export function embeddingsEnabled() {
  if (process.env.VECTOR_INDEX_EMBEDDINGS === '0') return false;
  return Boolean(apiKey());
}
 
export function embeddingModelId() {
  return process.env.VECTOR_INDEX_EMBED_MODEL ?? process.env.RESILIENCE_EMBEDDING_MODEL ?? DEFAULT_MODEL;
}
 
function endpoint() {
  return process.env.VECTOR_INDEX_OPENAI_EMBEDDINGS_URL ?? 'https://api.openai.com/v1/embeddings';
}
 
/**
 * @param {string} text
 * @param {{ model?: string }} [opts]
 * @returns {Promise<{ vector: Float32Array, model: string, dim: number }>}
 */
function parseEmbeddingVector(vec, model) {
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error('Embedding response missing vector');
  }
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = Number(vec[i]) || 0;
  return { vector: out, model, dim: out.length };
}

async function embeddingRequest(model, input) {
  const key = apiKey();
  if (!key) throw new Error('Embedding API key not configured');
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`Embedding request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function embedText(text, opts = {}) {
  const model = opts.model ?? embeddingModelId();
  const clean = String(text ?? '').trim();
  if (!clean) {
    return { vector: new Float32Array(DEFAULT_DIM_HINT), model, dim: DEFAULT_DIM_HINT };
  }
  const data = await embeddingRequest(model, clean.slice(0, 8000));
  return parseEmbeddingVector(data?.data?.[0]?.embedding, model);
}

const DEFAULT_BATCH_SIZE = 64;

/**
 * Batch embed multiple texts (OpenAI supports array input).
 * @param {string[]} texts
 * @param {{ model?: string, batchSize?: number }} [opts]
 * @returns {Promise<Array<{ vector: Float32Array, model: string, dim: number }>>}
 */
export async function embedTexts(texts, opts = {}) {
  const model = opts.model ?? embeddingModelId();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const list = (Array.isArray(texts) ? texts : []).map((t) => String(t ?? '').trim().slice(0, 8000));
  const out = [];

  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    const inputs = batch.map((t) => (t || ' '));
    const data = await embeddingRequest(model, inputs);
    const items = data?.data ?? [];
    items.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (let j = 0; j < batch.length; j++) {
      const item = items[j];
      const vec = item?.embedding;
      if (Array.isArray(vec) && vec.length) {
        out.push(parseEmbeddingVector(vec, model));
      } else {
        out.push({ vector: new Float32Array(DEFAULT_DIM_HINT), model, dim: DEFAULT_DIM_HINT });
      }
    }
  }
  return out;
}
 
async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

