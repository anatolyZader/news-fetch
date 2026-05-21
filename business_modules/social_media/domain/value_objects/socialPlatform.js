/**
 * Social platforms searched during citizen-voice OSINT gathering.
 */
export const SOCIAL_PLATFORMS = Object.freeze([
  'x',
  'facebook_public',
  'facebook_public_group',
  'youtube',
  'tiktok',
  'telegram_public',
  'reddit',
  'hebrew_forums',
  'hebrew_forum_hasolidit',
  'hebrew_forum_rotter',
  'instagram',
]);

export const DEFAULT_PLATFORMS_SEARCHED = Object.freeze([
  'x',
  'facebook_public',
  'youtube',
  'tiktok',
  'telegram_public',
  'reddit',
  'hebrew_forums',
]);

/** UI-selectable platforms for on-demand topic fetch. */
export const SELECTABLE_PLATFORMS = Object.freeze([
  { id: 'x', labelKey: 'socialMedia.platform.x', defaultSelected: true },
  { id: 'facebook_public', labelKey: 'socialMedia.platform.facebook', defaultSelected: true },
  { id: 'telegram_public', labelKey: 'socialMedia.platform.telegram', defaultSelected: true },
]);

export const DEFAULT_TOPIC_FETCH_PLATFORMS = Object.freeze(
  SELECTABLE_PLATFORMS.filter((p) => p.defaultSelected).map((p) => p.id),
);

export function normalizePlatformSelection(platforms) {
  const allowed = new Set(SOCIAL_PLATFORMS);
  const out = [];
  for (const p of platforms ?? []) {
    const id = String(p ?? '').trim();
    if (id && allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out.length ? out : [...DEFAULT_TOPIC_FETCH_PLATFORMS];
}

export const CONTENT_KIND_OSINT = 'osint_citizen_voice';
export const SOURCE_TYPE_SOCIAL = 'social';
