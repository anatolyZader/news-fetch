import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInProcessMetricsPort } from '../../../cross-cut-modules/monitoring/infrastructure/adapters/inProcessMetricsPort.js';
import { createTracingMetricsPort } from '../../../cross-cut-modules/monitoring/infrastructure/adapters/tracingMetricsPort.js';
import { durationMetricName } from '../../../cross-cut-modules/monitoring/domain/metricNames.js';

describe('inProcessMetricsPort', () => {
  it('aggregates histogram samples with percentiles', () => {
    const metrics = createInProcessMetricsPort();
    for (const ms of [10, 20, 30, 40, 100]) {
      metrics.histogram('chat.request.duration_ms', ms);
    }
    const snap = metrics.snapshot();
    assert.equal(snap['chat.request.duration_ms'].count, 5);
    assert.equal(snap['chat.request.duration_ms'].p50, 30);
    assert.equal(snap['chat.request.duration_ms'].max, 100);
  });

  it('tracingMetricsPort records span duration', async () => {
    const metrics = createInProcessMetricsPort();
    const trace = createTracingMetricsPort({ metricsPort: metrics });
    await trace.startActiveSpan('chat.request', async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    const key = durationMetricName('chat.request');
    const snap = metrics.snapshot();
    assert.equal(snap[key].count, 1);
    assert.ok(snap[key].p50 >= 4);
  });
});
