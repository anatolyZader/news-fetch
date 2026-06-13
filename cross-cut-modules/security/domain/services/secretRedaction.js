/**
 * Redact secrets from objects/strings before writing to audit or cost logs.
 */

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_RE = /api[_-]?key|secret|password|token|authorization/i;

const SENSITIVE_STRING_PATTERNS = [
  /\bsk-ant-[A-Za-z0-9_-]{8,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /Bearer\s+[\w.-]+/gi,
];

/**
 * @param {string} text
 * @returns {string}
 */
function redactSensitiveStrings(text) {
  let out = text;
  for (const pattern of SENSITIVE_STRING_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

/**
 * Deep-walk and redact sensitive keys and string patterns.
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactSecrets(value) {
  if (value == null) return value;
  if (typeof value === 'string') return redactSensitiveStrings(value);
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = redactSecrets(val);
      }
    }
    return out;
  }
  return value;
}
