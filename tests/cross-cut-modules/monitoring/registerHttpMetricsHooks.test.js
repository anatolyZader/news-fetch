import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

import { registerHttpMetricsHooks } from '../../../cross-cut-modules/monitoring/input/registerHttpMetricsHooks.js';
import { METRIC } from '../../../cross-cut-modules/monitoring/domain/metricNames.js';

function createRecordingMetricsPort() {
  const histograms = [];
  const counters = [];
  return {
    histograms,
    counters,
    histogram(name, ms, labels) { histograms.push({ name, ms, labels }); },
    increment(name, value, labels) { counters.push({ name, value, labels }); },
    gauge() {},
  };
}

describe('registerHttpMetricsHooks', () => {
  it('records a histogram sample with route pattern labels', async () => {
    const app = Fastify({ logger: false });
    const metricsPort = createRecordingMetricsPort();
    registerHttpMetricsHooks(app, { metricsPort });
    app.get('/api/thing/:id', async () => ({ ok: true }));

    const res = await app.inject({ method: 'GET', url: '/api/thing/42' });
    assert.equal(res.statusCode, 200);

    assert.equal(metricsPort.histograms.length, 1);
    const sample = metricsPort.histograms[0];
    assert.equal(sample.name, METRIC.HTTP_REQUEST_DURATION);
    assert.ok(sample.ms >= 0);
    assert.deepEqual(sample.labels, { route: '/api/thing/:id', method: 'GET', status: '2xx' });

    assert.equal(metricsPort.counters.length, 1);
    assert.equal(metricsPort.counters[0].name, METRIC.HTTP_REQUESTS);
    await app.close();
  });

  it('labels unmatched routes and 4xx statuses', async () => {
    const app = Fastify({ logger: false });
    const metricsPort = createRecordingMetricsPort();
    registerHttpMetricsHooks(app, { metricsPort });

    const res = await app.inject({ method: 'GET', url: '/nope' });
    assert.equal(res.statusCode, 404);
    const sample = metricsPort.histograms[0];
    assert.equal(sample.labels.status, '4xx');
    await app.close();
  });

  it('is a no-op without a metrics port', async () => {
    const app = Fastify({ logger: false });
    registerHttpMetricsHooks(app, {});
    app.get('/x', async () => ({ ok: true }));
    const res = await app.inject({ method: 'GET', url: '/x' });
    assert.equal(res.statusCode, 200);
    await app.close();
  });
});
