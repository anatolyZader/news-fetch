import { monitorEventLoopDelay } from 'node:perf_hooks';

import { METRIC } from '../../domain/metricNames.js';

const NS_PER_MS = 1e6;

/**
 * Periodic process-level gauges: event-loop delay percentiles, heap/RSS,
 * active SSE streams. Interval is unref'd so it never keeps the process alive.
 *
 * @param {{
 *   metricsPort: { gauge: Function },
 *   intervalMs?: number,
 *   getActiveSseStreams?: (() => number) | null,
 * }} deps
 * @returns {{ stop: () => void, getLoopDelayP99Ms: () => number }}
 */
export function startRuntimeGauges(deps) {
  const { metricsPort, intervalMs = 5000, getActiveSseStreams = null } = deps;
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  let lastP99Ms = 0;

  const sample = () => {
    lastP99Ms = histogram.percentile(99) / NS_PER_MS;
    metricsPort.gauge(METRIC.EVENT_LOOP_DELAY_P50, histogram.percentile(50) / NS_PER_MS);
    metricsPort.gauge(METRIC.EVENT_LOOP_DELAY_P99, lastP99Ms);
    metricsPort.gauge(METRIC.EVENT_LOOP_DELAY_MAX, histogram.max / NS_PER_MS);
    histogram.reset();

    const mem = process.memoryUsage();
    metricsPort.gauge(METRIC.HEAP_USED_BYTES, mem.heapUsed);
    metricsPort.gauge(METRIC.RSS_BYTES, mem.rss);

    if (getActiveSseStreams) {
      metricsPort.gauge(METRIC.ACTIVE_SSE_STREAMS, getActiveSseStreams());
    }
  };

  const timer = setInterval(sample, intervalMs);
  if (typeof timer?.unref === 'function') timer.unref();

  return {
    stop() {
      clearInterval(timer);
      histogram.disable();
    },
    getLoopDelayP99Ms() {
      return lastP99Ms;
    },
  };
}
