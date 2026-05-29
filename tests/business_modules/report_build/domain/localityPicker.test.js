import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocalityPickerMessage,
  parseLocalityPickerReply,
  needsStructuredLocality,
} from '../../../../business_modules/report_build/domain/localityPicker.js';

describe('localityPicker', () => {
  const options = [
    { canonicalKey: 'metula', displayName: 'מטולה' },
    { canonicalKey: 'kiryat_shmona', displayName: 'קריית שמונה' },
  ];

  it('builds numbered picker message', () => {
    const msg = buildLocalityPickerMessage(options);
    assert.match(msg, /1\. מטולה/);
    assert.match(msg, /2\. קריית שמונה/);
  });

  it('parses numeric reply', () => {
    const picked = parseLocalityPickerReply('2', options);
    assert.equal(picked?.canonicalKey, 'kiryat_shmona');
  });

  it('parses exact name reply', () => {
    const picked = parseLocalityPickerReply('מטולה', options);
    assert.equal(picked?.canonicalKey, 'metula');
  });

  it('needsStructuredLocality when localityKey missing', () => {
    assert.equal(needsStructuredLocality({ observation: { locality: 'foo' } }), true);
    assert.equal(needsStructuredLocality({ observation: { localityKey: 'metula' } }), false);
  });
});
