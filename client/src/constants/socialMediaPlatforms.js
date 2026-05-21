/** Topic-fetch platform options (mirrors SELECTABLE_PLATFORMS in social_media module). */
export const TOPIC_FETCH_PLATFORMS = Object.freeze([
  { id: 'x', labelKey: 'socialMedia.platform.x', defaultSelected: true },
  { id: 'facebook_public', labelKey: 'socialMedia.platform.facebook', defaultSelected: true },
  { id: 'telegram_public', labelKey: 'socialMedia.platform.telegram', defaultSelected: true },
]);

export const DEFAULT_TOPIC_FETCH_PLATFORM_IDS = TOPIC_FETCH_PLATFORMS
  .filter((p) => p.defaultSelected)
  .map((p) => p.id);
