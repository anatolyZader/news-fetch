/**
 * Namespaced logger for scripts and services (stderr by default for pipeline output).
 * @param {string} namespace
 */
export function createLogger(namespace) {
  const prefix = `[${namespace}]`;

  return {
    /** @param {...unknown} args */
    info(...args) {
      console.error(prefix, ...args);
    },
    /** @param {...unknown} args */
    warn(...args) {
      console.error(prefix, 'WARN', ...args);
    },
    /** @param {...unknown} args */
    error(...args) {
      console.error(prefix, 'ERROR', ...args);
    },
    /** @param {...unknown} args */
    log(...args) {
      console.log(prefix, ...args);
    },
  };
}
