import { isLocalizedLang } from './parseLocale.js';
import { getLocaleSchema } from './localeSchemas.js';
import { extractForTranslation, applyTranslations } from './localePathUtils.js';
import {
  fingerprintPayload,
  readLocaleCache,
  writeLocaleCache,
} from './localeCache.js';
import { translateGenericJsonWithRetry } from './translateGenericJson.js';

function isTranslationEnabled() {
  return process.env.TRANSLATION_ENABLED === 'true';
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

  const chunkPayload = { strings: entries };
  let translatedStrings;
  try {
    ({ result: translatedStrings } = await translateGenericJsonWithRetry(chunkPayload, lang, {
      costLabel: `locale-${resourceId}-${lang}`,
      costDate: opts.costDate,
      queryHint: resourceId,
    }));
  } catch {
    return payload;
  }

  const translatedById = {};
  for (const row of translatedStrings.strings ?? []) {
    if (row?.id && row?.text != null) translatedById[row.id] = row.text;
  }

  const result = applyTranslations(payload, entries, pathMeta, translatedById);
  await writeLocaleCache(resourceId, fingerprint, lang, result);
  return result;
}

export { isTranslationEnabled };
