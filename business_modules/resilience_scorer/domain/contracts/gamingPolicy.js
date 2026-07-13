/**
 * Anti-gaming policy helpers shared across modules (WhatsApp ingest, etc.).
 */

/**
 * @param {string|null|undefined} phone
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isDmPhoneAllowed(phone, env = process.env) {
  const raw = env.WHATSAPP_ALLOWED_DM_PHONES;
  if (raw == null || String(raw).trim() === '') return true;
  const allow = new Set(String(raw).split(',').map((s) => s.trim()).filter(Boolean));
  return phone != null && allow.has(String(phone));
}
