import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EPHEMERAL_SOURCE_TYPES,
  isEphemeralSourceType,
} from '../../../cross-cut-modules/source_archive/retentionPolicy.js';

describe('retentionPolicy', () => {
  it('EPHEMERAL_SOURCE_TYPES includes news radio social', () => {
    assert.deepEqual([...EPHEMERAL_SOURCE_TYPES], ['news', 'radio', 'social']);
  });

  it('isEphemeralSourceType is case-insensitive for ephemeral types', () => {
    assert.equal(isEphemeralSourceType('news'), true);
    assert.equal(isEphemeralSourceType('RADIO'), true);
    assert.equal(isEphemeralSourceType('social'), true);
  });

  it('field visits whatsapp manual audio are permanent', () => {
    for (const t of ['field', 'whatsapp', 'manual', 'audio', 'video']) {
      assert.equal(isEphemeralSourceType(t), false);
    }
  });
});
