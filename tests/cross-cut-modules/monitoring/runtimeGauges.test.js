import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { startRuntimeGauges } from '../../../cross-cut-modules/monitoring/infrastructure/adapters/runtimeGauges.js';
import {
  registerActiveStream,
  getActiveStreamCount,
  abortAllActiveStreams,
} from '../../../cross-cut-modules/monitoring/app/activeStreams.js';
import { METRIC } from '../../../cross-cut-modules/monitoring/domain/metricNames.js';

describe('runtimeGauges', () => {
  it('emits loop-delay, memory, and stream gauges on each tick', async () => {
    const gauges = new Map();
    const metricsPort = {
      gauge(name, value) { gauges.set(name, value); },
      histogram() {},
      increment() {},
    };
    const handle = startRuntimeGauges({
      metricsPort,
      intervalMs: 20,
      getActiveSseStreams: () => 3,
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    handle.stop();

    assert.ok(gauges.has(METRIC.EVENT_LOOP_DELAY_P99));
    assert.ok(gauges.get(METRIC.HEAP_USED_BYTES) > 0);
    assert.ok(gauges.get(METRIC.RSS_BYTES) > 0);
    assert.equal(gauges.get(METRIC.ACTIVE_SSE_STREAMS), 3);
    assert.equal(typeof handle.getLoopDelayP99Ms(), 'number');
  });

  it('stops emitting after stop()', async () => {
    let calls = 0;
    const metricsPort = { gauge() { calls += 1; }, histogram() {}, increment() {} };
    const handle = startRuntimeGauges({ metricsPort, intervalMs: 10 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    handle.stop();
    const afterStop = calls;
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(calls, afterStop);
  });
});

describe('activeStreams registry', () => {
  it('tracks registration, unregistration, and mass abort', () => {
    const before = getActiveStreamCount();
    const a = new AbortController();
    const b = new AbortController();
    const unregisterA = registerActiveStream(a);
    registerActiveStream(b);
    assert.equal(getActiveStreamCount(), before + 2);

    unregisterA();
    assert.equal(getActiveStreamCount(), before + 1);
    assert.equal(a.signal.aborted, false);

    abortAllActiveStreams('test shutdown');
    assert.equal(b.signal.aborted, true);
    assert.equal(String(b.signal.reason?.message), 'test shutdown');
  });
});
