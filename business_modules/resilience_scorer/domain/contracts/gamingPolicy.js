/**
 * Anti-gaming policy helpers for ingest channels (WhatsApp DM allowlist).
 *
 * Pipeline position: ingest path — gates field/WhatsApp sources before signals
 * enter extraction. Client-safe isomorphic (env-driven, no I/O).
 *
 * Owns: isDmPhoneAllowed phone allowlist check.
 * Does NOT: message parsing, signal extraction, or report surfacing.
 *
 * Key collaborators: WhatsApp ingest adapters, gamingPolicy consumers in
 * composition/registerIngestion.js.
 */

/**
 * Return true when a DM sender phone is permitted under WHATSAPP_ALLOWED_DM_PHONES.
 * Empty/unset env means all phones allowed (open ingest).
 * @param {string|null|undefined} phone
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isDmPhoneAllowed(phone, env = process.env) {
  const raw = env.WHATSAPP_ALLOWED_DM_PHONES;
  if (raw == null || String(raw).trim() === '') return true;
  const allow = new Set(String(raw).split(',').map((s) => s.trim()).filter(Boolean));
  return phone != null && allow.has(String(phone));
}
