import { durationMetricName } from '../../domain/metricNames.js';

/**
 * Trace port that records span wall time into an IMetricsPort histogram.
 *
 * @param {{ metricsPort: { histogram: (name: string, ms: number, labels?: Record<string, string>) => void } }} deps
 */
export function createTracingMetricsPort(deps) {
  const metricsPort = deps.metricsPort;

  return {
    /**
     * @template T
     * @param {string} name
     * @param {(span: { setAttribute: (k: string, v: string|number|boolean) => void }) => T | Promise<T>} fn
     * @returns {T | Promise<T>}
     */
    async startActiveSpan(name, fn) {
      /** @type {Record<string, string|number|boolean>} */
      const attrs = {};
      const span = {
        setAttribute(k, v) {
          attrs[k] = v;
        },
      };
      const start = performance.now();
      try {
        return await fn(span);
      } finally {
        const ms = performance.now() - start;
        const labels = {};
        for (const [k, v] of Object.entries(attrs)) {
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            labels[k] = String(v);
          }
        }
        metricsPort.histogram(durationMetricName(name), ms, labels);
      }
    },
  };
}
