import { isLocalizedLang } from './parseLocale.js';
import { getLocaleSchema } from './localeSchemas.js';
import { extractForTranslation, applyTranslations } from './localePathUtils.js';
import {
  fingerprintPayload,
  readLocaleCache,
  writeLocaleCache,
} from './localeCache.js';
import { translateGenericJsonWithRetry } from './translateGenericJson.js';
import { shouldSkipTranslation } from './detectSourceLang.js';

const DEFAULT_CHUNK_SIZE = 40;
const CHUNK_CONCURRENCY = 2;

function isTranslationEnabled() {
  return process.env.TRANSLATION_ENABLED === 'true';
}

/**
 * @param {Array<{ id: string, text: string, sourceLang?: string }>} entries
 * @param {number} chunkSize
 */
function chunkEntries(entries, chunkSize) {
  const chunks = [];
  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(entries.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * @template T
 * @param {Array<() => Promise<T>>} tasks
 * @param {number} limit
 */
async function runWithConcurrencyLimit(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const idx = next;
      next += 1;
      results[idx] = await tasks[idx]();
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Localize a JSON payload using declarative schema + LLM + disk cache.
 *
 * @param {object} payload
 * @param {string} resourceId
 * @param {string} lang
 * @param {{ fingerprintExtra?: string, costDate?: string }} [opts]
 * @returns {Promise<object>}
 */
export async function localizePayload(payload, resourceId, lang, opts = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  if (!isLocalizedLang(lang) || !isTranslationEnabled()) return payload;

  const schema = getLocaleSchema(resourceId);
  if (!schema) return payload;

  const fingerprint = fingerprintPayload(resourceId, payload, opts.fingerprintExtra ?? '');
  const cached = await readLocaleCache(resourceId, fingerprint, lang);
  if (cached) return cached;

  const { entries, pathMeta } = extractForTranslation(payload, schema);
  if (!entries.length) return payload;

  const translatedById = {};
  const toTranslate = [];
  const toTranslateMeta = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const sourceLang = entry.sourceLang ?? 'en';
    if (shouldSkipTranslation(sourceLang, lang)) {
      translatedById[entry.id] = entry.text;
    } else {
      toTranslate.push(entry);
      toTranslateMeta.push(pathMeta[i]);
    }
  }

  const chunkSize = schema.chunkSize ?? DEFAULT_CHUNK_SIZE;
  if (toTranslate.length) {
    const chunks = chunkEntries(toTranslate, chunkSize);
    const chunkTasks = chunks.map((batch, batchIdx) => async () => {
      const chunkPayload = { strings: batch };
      const sourceLangs = [...new Set(batch.map((row) => row.sourceLang ?? 'en'))];
      const sourceHint = sourceLangs.length === 1 ? sourceLangs[0] : 'mixed';
      try {
        const { result } = await translateGenericJsonWithRetry(chunkPayload, lang, {
          costLabel: `locale-${resourceId}-${lang}-chunk${batchIdx}`,
          costDate: opts.costDate,
          queryHint: resourceId,
          sourceLang: sourceHint,
        });
        for (const row of result.strings ?? []) {
          if (row?.id && row?.text != null) translatedById[row.id] = row.text;
        }
      } catch {
        for (const row of batch) {
          translatedById[row.id] = row.text;
        }
      }
    });

    await runWithConcurrencyLimit(chunkTasks, CHUNK_CONCURRENCY);
  }

  const result = applyTranslations(payload, entries, pathMeta, translatedById);
  await writeLocaleCache(resourceId, fingerprint, lang, result);
  return result;
}

export { isTranslationEnabled };
