/**
 * Trace port — no-op default; swap for OpenTelemetry adapter in v2.
 */

export const noopTracePort = {
  /**
   * @template T
   * @param {string} _name
   * @param {(span: { setAttribute: (k: string, v: string|number|boolean) => void }) => T | Promise<T>} fn
   * @returns {T | Promise<T>}
   */
  async startActiveSpan(_name, fn) {
    const span = { setAttribute() {} };
    return fn(span);
  },
};

/**
 * @returns {typeof noopTracePort}
 */
export function createNoopTracePort() {
  return noopTracePort;
}
