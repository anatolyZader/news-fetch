/**
 * Heuristic source-language detection for ingest text (news/radio).
 *
 * @param {unknown} text
 * @returns {'en' | 'he'}
 */
export function detectSourceLang(text) {
  const sample = String(text ?? '').trim().slice(0, 600);
  if (!sample) return 'en';
  let nonLatin = 0;
  for (const ch of sample) {
    if ((ch.codePointAt(0) ?? 0) > 0x7f) nonLatin += 1;
  }
  return nonLatin > sample.length * 0.12 ? 'he' : 'en';
}

/**
 * @param {unknown} raw
 * @returns {'en' | 'he' | 'ru'}
 */
export function normalizeSourceLang(raw) {
  const lang = String(raw ?? '').trim().toLowerCase().slice(0, 3);
  if (lang === 'he' || lang === 'heb' || lang === 'iw') return 'he';
  if (lang === 'ru' || lang === 'rus') return 'ru';
  return 'en';
}

/**
 * @param {'en' | 'he' | 'ru'} sourceLang
 * @param {'en' | 'he' | 'ru'} targetLang
 */
export function shouldSkipTranslation(sourceLang, targetLang) {
  return sourceLang === targetLang;
}
