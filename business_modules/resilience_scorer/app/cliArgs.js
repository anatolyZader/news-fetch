/**
 * Minimal argv helpers shared by this module's CLIs (input/ and app/ CLI runners).
 */

/**
 * @param {string[]} argv
 * @param {string} flag e.g. '--date'
 * @returns {string|null} value following the flag, or null
 */
export function getArg(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

/**
 * @param {string[]} argv
 * @param {string} flag
 * @returns {boolean}
 */
export function hasFlag(argv, flag) {
  return argv.includes(flag);
}
