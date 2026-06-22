/**
 * Optional semantic output gate for agent responses.
 *
 * Disabled by default. When enabled, compares two texts by embedding and cosine
 * similarity, returning a telemetry verdict rather than blocking the agent.
 */

import { cosineSim } from '../../../vector_index/vectorMath.js';

const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';

function gateEnabled() {
  const v = process.env.RESILIENCE_SEMANTIC_OUTPUT_GATE_ENABLED;
  if (v == null || v === '') return false;
  return v === '1' || v === 'true' || v === 'on';
}

function embeddingApiKey() {
  return process.env.RESILIENCE_EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
}

function similarityThreshold() {
  const n = Number.parseFloat(process.env.RESILIENCE_SEMANTIC_OUTPUT_GATE_THRESHOLD ?? '0.85');
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.85;
}

function embeddingModel() {
  return process.env.RESILIENCE_SEMANTIC_OUTPUT_GATE_EMBED_MODEL
    ?? process.env.RESILIENCE_EMBEDDING_MODEL
    ?? DEFAULT_EMBED_MODEL;
}

async function fetchEmbeddingVector(text) {
  const key = embeddingApiKey();
  if (!key || typeof text !== 'string') return null;
  const bodyText = text.trim();
  if (!bodyText) return null;

  const model = embeddingModel();

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: bodyText.slice(0, 8000) }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const vec = data?.data?.[0]?.embedding;
  return Array.isArray(vec) ? vec : null;
}

/**
 * @param {{
 *  leftText: string,
 *  rightText: string,
 *  threshold?: number
 *  label?: string
 * }} params
 * @returns {Promise<{ enabled: boolean, ok: boolean|null, similarity: number|null, threshold: number|null, reason: string }>}
 */
export async function semanticOutputGate(params) {
  const threshold = params.threshold ?? similarityThreshold();
  const enabled = gateEnabled();
  if (!enabled) {
    return { enabled: false, ok: null, similarity: null, threshold, reason: 'disabled' };
  }

  const left = params.leftText ?? '';
  const right = params.rightText ?? '';
  if (!left.trim() || !right.trim()) {
    return { enabled, ok: null, similarity: null, threshold, reason: 'empty_text' };
  }

  const [lv, rv] = await Promise.all([
    fetchEmbeddingVector(left),
    fetchEmbeddingVector(right),
  ]);

  if (!lv || !rv) {
    return { enabled, ok: null, similarity: null, threshold, reason: 'embedding_failed' };
  }

  const similarity = cosineSim(lv, rv);
  const ok = similarity >= threshold;
  return { enabled, ok, similarity, threshold, reason: 'ok' };
}

