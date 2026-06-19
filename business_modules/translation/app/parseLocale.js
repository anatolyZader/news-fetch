const SUPPORTED = new Set(['en', 'he', 'ru']);

/**
 * @param {unknown} raw
 * @returns {'en' | 'he' | 'ru'}
 */
export function normalizeLocale(raw) {
  const lang = String(raw ?? '').trim().toLowerCase().slice(0, 2);
  if (SUPPORTED.has(lang)) return /** @type {'en' | 'he' | 'ru'} */ (lang);
  return 'en';
}

/**
 * Resolve locale from Fastify request or explicit values.
 *
 * @param {{ query?: Record<string, unknown>, body?: Record<string, unknown>, headers?: Record<string, unknown> }} [request]
 * @param {{ lang?: string }} [explicit]
 * @returns {'en' | 'he' | 'ru'}
 */
export function parseLocale(request, explicit) {
  if (explicit?.lang) return normalizeLocale(explicit.lang);
  const fromQuery = request?.query?.lang;
  if (fromQuery) return normalizeLocale(fromQuery);
  const fromBody = request?.body?.lang ?? request?.body?.uiLang;
  if (fromBody) return normalizeLocale(fromBody);
  const accept = request?.headers?.['accept-language'] ?? request?.headers?.['Accept-Language'];
  if (typeof accept === 'string') {
    const first = accept.split(',')[0]?.split('-')[0];
    if (first) return normalizeLocale(first);
  }
  return 'en';
}

export function isLocalizedLang(lang) {
  return lang === 'he' || lang === 'ru';
}
