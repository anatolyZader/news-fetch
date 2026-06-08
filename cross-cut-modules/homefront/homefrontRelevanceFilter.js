/**
 * Keyword + behavior prefilter for homefront news (replaces LLM by default).
 */
import { isHomefrontRelevant } from '../../business_modules/social_media/domain/services/homefrontKeywords.js';
import {
  hasPopulationBehaviorSignal,
  isMilitaryOperationsNews,
  isAttackAlertOnly,
} from '../../business_modules/social_media/domain/services/homefrontBehaviorFilter.js';
import { embedText, embeddingsEnabled } from '../vector_index/index.js';

const PROTOTYPE_QUERIES = [
  'Israeli civilians sheltering evacuation emergency behavior under attack',
  'community resilience municipal services schools closed population coping',
  'home front command instructions residents anxiety trauma support',
];

/**
 * @returns {'keyword'|'embedding'|'keyword+embedding'|'llm'}
 */
export function homefrontPrefilterMode() {
  const v = String(process.env.HOMEFRONT_PREFILTER_MODE ?? 'keyword').trim().toLowerCase();
  if (v === 'llm' || v === 'embedding' || v === 'keyword+embedding') return v;
  return 'keyword';
}

function snippet(body, max = 400) {
  return String(body ?? '').trim().slice(0, max);
}

/**
 * @param {string} title
 * @param {string} body
 */
export function isNewsArticleBehaviorRelevant(title, body) {
  const text = `${String(title ?? '')}\n${snippet(body, 400)}`;
  if (isMilitaryOperationsNews(text)) return false;
  if (isAttackAlertOnly(text)) return false;
  if (hasPopulationBehaviorSignal(text)) return true;
  if (isHomefrontRelevant(title, snippet(body, 200))) return true;
  return false;
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

function cosine(a, b) {
  return dot(a, b) / (norm(a) * norm(b));
}

let prototypeVectors = null;

async function ensurePrototypeVectors() {
  if (prototypeVectors) return prototypeVectors;
  if (!embeddingsEnabled()) return null;
  prototypeVectors = await Promise.all(
    PROTOTYPE_QUERIES.map((q) => embedText(q).then((r) => r.vector)),
  );
  return prototypeVectors;
}

/**
 * @param {string} title
 * @param {string} body
 */
async function passesEmbeddingGate(title, body) {
  const protos = await ensurePrototypeVectors();
  if (!protos?.length) return true;
  const text = `${title}\n${snippet(body, 300)}`.trim();
  if (!text) return false;
  const { vector } = await embedText(text);
  const minSim = Number.parseFloat(process.env.HOMEFRONT_EMBED_MIN_SIM ?? '0.32');
  const threshold = Number.isFinite(minSim) ? minSim : 0.32;
  let best = -1;
  for (const p of protos) {
    best = Math.max(best, cosine(vector, p));
  }
  return best >= threshold;
}

/**
 * @param {object[]} articles
 * @param {{ onUsage?: Function }} [opts]
 */
export async function preFilterByRelevance(articles, _opts = {}) {
  if (articles.length === 0) return articles;
  const mode = homefrontPrefilterMode();
  const useEmbed = mode === 'embedding' || mode === 'keyword+embedding';
  const useKeyword = mode === 'keyword' || mode === 'keyword+embedding';

  const selected = [];
  for (const art of articles) {
    const title = art.title ?? '';
    const body = art.body ?? art.content ?? '';
    let keep = false;
    if (useKeyword && isNewsArticleBehaviorRelevant(title, body)) {
      keep = true;
    }
    if (!keep && useEmbed && embeddingsEnabled()) {
      keep = await passesEmbeddingGate(title, body);
    }
    if (keep) selected.push(art);
  }

  console.error(`  → relevance pre-filter (${mode}): ${selected.length}/${articles.length} articles selected`);
  return selected;
}
