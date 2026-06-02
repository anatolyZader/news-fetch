import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEventPayload } from '../../cross-cut-modules/messaging/domain/eventSchemas.js';
import { EVENT_TYPES } from '../../cross-cut-modules/messaging/domain/eventTypes.js';

describe('contract: mailing.digest.requested', () => {
  it('validates fixture payload', () => {
    const payload = {
      eventVersion: 1,
      userUid: 'uid-1',
      email: 'ops@example.com',
      products: ['report'],
      language: 'he',
    };
    assert.doesNotThrow(() =>
      validateEventPayload(EVENT_TYPES.MAILING_DIGEST_REQUESTED, payload));
  });
});
