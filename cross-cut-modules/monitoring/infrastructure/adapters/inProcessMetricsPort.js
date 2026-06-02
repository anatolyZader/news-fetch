/**
 * In-process metrics port — rolling histograms for latency observability (Option A).
 * No external deps; snapshot exposed via monitoring summary API.
 */

const MAX_SAMPLES_PER_METRIC = 512;

/**
 * @param {string} name
 * @param {Record<string, string>|undefined} labels
 */
function metricKey(name, labels) {
  if (!labels || Object.keys(labels).length === 0) return name;
  const parts = Object.keys(labels).sort().map((k) => `${k}=${labels[k]}`);
  return `${name}{${parts.join(',')}}`;
}

/**
 * @param {number[]} sorted
 * @param {number} p
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

/**
 * @returns {typeof import('../../domain/ports/IMetricsPort.js').noopMetricsPort & { snapshot: () => object }}
 */
export function createInProcessMetricsPort() {
  /** @type {Map<string, { count: number, sum: number, min: number, max: number, samples: number[], gauge?: number, counter: number }>} */
  const store = new Map();

  /**
   * @param {string} key
   */
  function bucket(key) {
    let b = store.get(key);
    if (!b) {
      b = { count: 0, sum: 0, min: Infinity, max: 0, samples: [], counter: 0 };
      store.set(key, b);
    }
    return b;
  }

  return {
    increment(name, value = 1, labels) {
      const b = bucket(metricKey(name, labels));
      b.counter += value;
    },

    gauge(name, value, labels) {
      const b = bucket(metricKey(name, labels));
      b.gauge = value;
    },

    histogram(name, ms, labels) {
      const n = Number(ms);
      if (!Number.isFinite(n) || n < 0) return;
      const b = bucket(metricKey(name, labels));
      b.count += 1;
      b.sum += n;
      b.min = Math.min(b.min, n);
      b.max = Math.max(b.max, n);
      b.samples.push(n);
      if (b.samples.length > MAX_SAMPLES_PER_METRIC) {
        b.samples.shift();
      }
    },

    snapshot() {
      /** @type {Record<string, object>} */
      const out = {};
      for (const [key, b] of store) {
        const sorted = [...b.samples].sort((a, c) => a - c);
        const entry = {
          count: b.count,
          sum: b.sum,
          min: b.count > 0 ? b.min : 0,
          max: b.max,
          p50: percentile(sorted, 50),
          p95: percentile(sorted, 95),
        };
        if (b.counter > 0) entry.counter = b.counter;
        if (b.gauge != null) entry.gauge = b.gauge;
        out[key] = entry;
      }
      return out;
    },
  };
}
