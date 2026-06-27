/**
 * Merge per-namespace locale JSON into flat key maps for t().
 */
const localeModules = import.meta.glob('./locales/*/*.json', { eager: true });

function buildTranslations() {
  /** @type {Record<'en'|'he'|'ru', Record<string, string>>} */
  const out = { en: {}, he: {}, ru: {} };
  for (const [path, mod] of Object.entries(localeModules)) {
    const match = /locales\/(en|he|ru)\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const loc = match[1];
    const data = mod.default ?? mod;
    if (data && typeof data === 'object') {
      Object.assign(out[loc], data);
    }
  }
  return out;
}

export const translations = buildTranslations();
