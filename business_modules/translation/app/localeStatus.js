/**
 * Locale / translation status for operator UI.
 */
export function getLocaleStatus(env = process.env) {
  const pretranslateLocales = String(env.PRETRANSLATE_LOCALES ?? 'he,ru')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    translationEnabled: env.TRANSLATION_ENABLED === 'true',
    supportedLocales: ['en', 'he', 'ru'],
    pretranslateConfigured: pretranslateLocales.length > 0,
    pretranslateLocales,
  };
}
