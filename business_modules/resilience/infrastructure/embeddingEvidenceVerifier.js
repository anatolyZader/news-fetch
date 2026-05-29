/**
 * Optional N8 embedding gate: rescue borderline containment failures when an
 * API key is configured. Otherwise skipped (no network).
 */

const DEFAULT_EMBED_MODEL = 'text-embedding-3-small';

/** Evidence types that require literal grounding — no embedding cosine rescue. */
export const DEFAULT_EMBEDDING_SKIP_TYPES = new Set([
  'direct_quote_named_person',
  'named_survey_statistic',
  'named_institutional_fact',
]);

/**
 * @param {string} evidenceType
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isEmbeddingRescueSkippedForType(evidenceType, env = process.env) {
  const raw = env.RESILIENCE_EMBEDDING_SKIP_TYPES;
  const skipSet = raw == null
    ? DEFAULT_EMBEDDING_SKIP_TYPES
    : new Set(String(raw).split(',').map((s) => s.trim()).filter(Boolean));
  return skipSet.has(evidenceType);
}

function embeddingApiKey() {
  return process.env.RESILIENCE_EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
}

function similarityThreshold() {
  const t = Number.parseFloat(process.env.RESILIENCE_EMBEDDING_SIM_THRESHOLD ?? '0.82');
  return Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.82;
}

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function norm(v) {
  return Math.sqrt(dot(v, v)) || 1;
}

function cosineSim(a, b) {
  return dot(a, b) / (norm(a) * norm(b));
}

/**
 * @param {string} text
 * @returns {Promise<number[]|null>}
 */
async function fetchEmbeddingVector(text) {
  const key = embeddingApiKey();
  if (!key || typeof text !== 'string' || !text.trim()) return null;
  const model = process.env.RESILIENCE_EMBEDDING_MODEL ?? DEFAULT_EMBED_MODEL;
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: text.slice(0, 8000) }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const vec = data?.data?.[0]?.embedding;
  return Array.isArray(vec) ? vec : null;
}

/**
 * When primary Jaccard/containment failed but was borderline, try embedding
 * similarity between evidence and a truncated article body.
 *
 * @param {object} signal
 * @param {string} [articleBody]
 * @param {{ ok: boolean, sim?: number }} primaryResult from verifyEvidenceAgainstArticle
 * @param {{ containmentThreshold?: number, borderlineLow?: number }} [opts]
 * @returns {Promise<{ ok: boolean, reason: string, sim?: number, skipped?: boolean }>}
 */
export async function maybeRescueEvidenceWithEmbedding(signal, articleBody, primaryResult, opts = {}) {
  if (process.env.RESILIENCE_EMBEDDING_VERIFY === '0') {
    return { ok: false, reason: 'embedding_disabled', skipped: true };
  }
  if (!embeddingApiKey()) {
    return { ok: false, reason: 'no_embedding_key', skipped: true };
  }
  if (primaryResult?.ok) {
    return { ok: true, reason: 'primary_ok' };
  }
  const evidenceType = signal?.evidence_type ?? 'observational_reported_fact';
  if (isEmbeddingRescueSkippedForType(evidenceType)) {
    return { ok: false, reason: 'embedding_skipped_type', skipped: true };
  }
  const thresholds = {
    direct_quote_named_person: 0.7,
    named_survey_statistic: 0.5,
    named_institutional_fact: 0.5,
    observational_reported_fact: 0.4,
  };
  const containmentThreshold = opts.containmentThreshold ?? thresholds[evidenceType] ?? 0.4;
  const borderlineLow = Number.parseFloat(
    process.env.RESILIENCE_EMBED_BORDERLINE_LOW ?? String(containmentThreshold * 0.72),
  );
  const sim = primaryResult?.sim;
  if (typeof sim !== 'number' || Number.isNaN(sim) || sim < borderlineLow || sim >= containmentThreshold) {
    return { ok: false, reason: 'not_borderline', skipped: true };
  }
  if (!articleBody || typeof articleBody !== 'string') {
    return { ok: false, reason: 'no_body', skipped: true };
  }

  const ev = signal?.evidence ?? '';
  const bodySnippet = articleBody.slice(0, 6000);
  const [evVec, bodyVec] = await Promise.all([
    fetchEmbeddingVector(ev),
    fetchEmbeddingVector(bodySnippet),
  ]);
  if (!evVec || !bodyVec) {
    return { ok: false, reason: 'embedding_fetch_failed' };
  }
  const c = cosineSim(evVec, bodyVec);
  const thr = similarityThreshold();
  if (c >= thr) {
    return { ok: true, reason: 'embedding_cosine', sim: c };
  }
  return { ok: false, reason: 'embedding_below_threshold', sim: c };
}
