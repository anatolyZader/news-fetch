import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEventPayload } from '../../cross-cut-modules/messaging/domain/eventSchemas.js';
import { EVENT_TYPES } from '../../cross-cut-modules/messaging/domain/eventTypes.js';

describe('contract: pbo.review.inbound.received', () => {
  it('validates fixture payload', () => {
    const payload = {
      eventVersion: 1,
      reviewId: 'rev-1',
      district: 'north',
    };
    assert.doesNotThrow(() =>
      validateEventPayload(EVENT_TYPES.PBO_REVIEW_INBOUND_RECEIVED, payload));
  });
});
