import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVENT_TYPES,
  validateEventPayload,
  createInProcessEventBus,
} from '../../cross-cut-modules/messaging/index.js';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('event contract fixtures', () => {
  for (const name of [
    'resilience.report.written.v1.json',
    'evidence.submission.completed.v1.json',
  ]) {
    it(`validates ${name}`, () => {
      const raw = JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8'));
      validateEventPayload(raw.type, raw.payload);
    });
  }

  it('bus delivers resilience.report.written', async () => {
    const bus = createInProcessEventBus();
    const fixture = JSON.parse(
      readFileSync(resolve(FIXTURES, 'resilience.report.written.v1.json'), 'utf8'),
    );
    let seen = false;
    bus.subscribe(EVENT_TYPES.RESILIENCE_REPORT_WRITTEN, () => {
      seen = true;
    });
    await bus.publish(fixture.type, fixture.payload);
    assert.equal(seen, true);
  });
});
