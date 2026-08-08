/**
 * Read-time key aliasing for persisted report JSON.
 *
 * Pipeline position: applied immediately after a report file is parsed, before
 * anything reads it. Client-safe isomorphic (no Node-only deps).
 *
 * Owns: the legacy→canonical key vocabulary, cheap detection, and the aliasing
 * walk. Does NOT: read files, write files, or migrate anything on disk.
 *
 * Why this exists: a report is the record of what the system said on a date. On
 * 2026-08-08 a vocabulary rename (`operator`→`user`, `analyst`→`developer`)
 * rewrote every persisted report in place to keep readers working — mutating
 * historical records that are not in git and had no backup. Aliasing at read
 * time makes that unnecessary: a future rename adds a rule here and leaves the
 * files alone.
 *
 * Key collaborators: `infrastructure/reportFileCache.js` (sole read choke
 * point), `app/reports/rewritePersistedReport.js` (the write-side guard).
 */

/**
 * Substring rewrites applied to object keys, longest-first.
 * A rule renames any key containing the substring — `operator_status` and
 * `narrative_operator` are both covered by one entry.
 */
export const REPORT_KEY_ALIAS_RULES = Object.freeze([
  Object.freeze({ from: 'operator', to: 'user' }),
  Object.freeze({ from: 'analyst', to: 'developer' }),
]);

/**
 * A legacy key is the word, optionally more key characters, then the closing
 * quote and the colon: `"narrative_operator":`, `"operator_status":`.
 *
 * Anchored on the word rather than on the opening quote. A leading `"[^"]*`
 * makes the engine scan from every quote in a multi-megabyte file and costs
 * ~14ms per report; matching the literal word first and checking a short tail
 * costs a fraction of that. Only keys are followed by `:` — a JSON string value
 * ending in the same word is followed by `,` or `}` — so prose that merely
 * mentions an operator does not match.
 */
const LEGACY_KEY_RE = new RegExp(
  `(?:${REPORT_KEY_ALIAS_RULES.map((r) => r.from).join('|')})[a-z0-9_]*"\\s*:`,
);

/**
 * Whether raw report text contains any legacy key at all.
 *
 * Cheap enough to run on every read, so the multi-megabyte aliasing walk only
 * happens for reports that actually predate a rename.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasLegacyReportKeys(text) {
  return LEGACY_KEY_RE.test(String(text ?? ''));
}

/**
 * Canonical form of a single key, or the key unchanged.
 *
 * @param {string} key
 * @returns {string}
 */
export function canonicalReportKey(key) {
  let out = String(key);
  for (const rule of REPORT_KEY_ALIAS_RULES) {
    if (out.includes(rule.from)) out = out.replaceAll(rule.from, rule.to);
  }
  return out;
}

/**
 * Rewrite legacy keys to canonical ones throughout a parsed report.
 *
 * Returns a new structure; the input is never mutated. When both the legacy and
 * canonical key are present the canonical value wins and the legacy one is
 * dropped — renaming over a live key would silently replace current data with
 * its superseded twin.
 *
 * @param {unknown} value parsed report (or any nested value)
 * @returns {unknown}
 */
export function applyReportKeyAliases(value) {
  if (Array.isArray(value)) return value.map((v) => applyReportKeyAliases(v));
  if (value === null || typeof value !== 'object') return value;

  const source = /** @type {Record<string, unknown>} */ (value);
  const out = {};
  // Canonical keys first, so a legacy key can never overwrite one that already
  // holds current data.
  for (const [key, v] of Object.entries(source)) {
    if (canonicalReportKey(key) === key) out[key] = applyReportKeyAliases(v);
  }
  for (const [key, v] of Object.entries(source)) {
    const canonical = canonicalReportKey(key);
    if (canonical === key) continue;
    if (Object.hasOwn(out, canonical)) continue;
    out[canonical] = applyReportKeyAliases(v);
  }
  return out;
}

/**
 * Parse report JSON, aliasing legacy keys only when any are present.
 *
 * @param {string} text
 * @returns {object}
 */
export function parseReportWithAliases(text) {
  const parsed = JSON.parse(text);
  return hasLegacyReportKeys(text) ? applyReportKeyAliases(parsed) : parsed;
}
