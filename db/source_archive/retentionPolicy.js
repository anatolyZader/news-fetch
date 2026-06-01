/**
 * Source archive retention: only high-volume raw feeds are ephemeral in SQLite.
 * Filesystem exports (homefront MD, field reports, etc.) are never purged by the app.
 */
export const EPHEMERAL_SOURCE_TYPES = Object.freeze(['news', 'radio', 'social']);

/**
 * @param {string} sourceType
 */
export function isEphemeralSourceType(sourceType) {
  return EPHEMERAL_SOURCE_TYPES.includes(String(sourceType ?? '').trim().toLowerCase());
}
