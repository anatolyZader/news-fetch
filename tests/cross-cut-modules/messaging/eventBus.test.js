import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInProcessEventBus,
  EVENT_TYPES,
  validateEventPayload,
} from '../../../cross-cut-modules/messaging/index.js';

describe('inProcessEventBus', () => {
  it('validates and delivers events', async () => {
    const bus = createInProcessEventBus();
    /** @type {object | null} */
    let received = null;
    bus.subscribe(EVENT_TYPES.RESILIENCE_REPORT_WRITTEN, (p) => {
      received = p;
    });
    const payload = {
      eventVersion: 1,
      date: '2026-01-01',
      scope: 'national',
      jsonPath: '/tmp/report.json',
    };
    validateEventPayload(EVENT_TYPES.RESILIENCE_REPORT_WRITTEN, payload);
    await bus.publish(EVENT_TYPES.RESILIENCE_REPORT_WRITTEN, payload);
    assert.deepEqual(received, payload);
  });

  it('rejects invalid payloads', () => {
    assert.throws(() => {
      validateEventPayload(EVENT_TYPES.RESILIENCE_REPORT_WRITTEN, { eventVersion: 1 });
    });
  });
});
