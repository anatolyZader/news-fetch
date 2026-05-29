/**
 * Metrics port — no-op default; swap for OpenTelemetry adapter in v2.
 */

export const noopMetricsPort = {
  /** @param {string} _name @param {number} _value @param {Record<string, string>} [_labels] */
  increment(_name, _value = 1, _labels) {},
  /** @param {string} _name @param {number} _value @param {Record<string, string>} [_labels] */
  gauge(_name, _value, _labels) {},
  /** @param {string} _name @param {number} _ms @param {Record<string, string>} [_labels] */
  histogram(_name, _ms, _labels) {},
};

/**
 * @returns {typeof noopMetricsPort}
 */
export function createNoopMetricsPort() {
  return noopMetricsPort;
}
