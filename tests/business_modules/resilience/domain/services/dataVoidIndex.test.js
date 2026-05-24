import { describe, it } from 'node:test';
import assert from 'node:assert';

import { computeDataVoidIndex } from '../../../../../business_modules/resilience/domain/services/dataVoidIndex.js';

describe('dataVoidIndex', () => {
  it('flags digital_darkness when digital silent but field active', () => {
    const r = computeDataVoidIndex(
      [
        { source_type: 'pbo', signal_type: 'service_continuity', evidence: 'officer report' },
      ],
      [[
        { source_type: 'whatsapp', evidence: 'a' },
        { source_type: 'news', evidence: 'b' },
        { source_type: 'news', evidence: 'c' },
      ]],
    );
    assert.equal(r.digital_darkness, true);
    assert.equal(r.level, 'critical');
    assert.ok(r.information_vacuum_index >= 0.8);
  });

  it('does not flag digital_darkness when digital and field both active', () => {
    const r = computeDataVoidIndex(
      [
        { source_type: 'whatsapp', evidence: 'chat' },
        { source_type: 'pbo', evidence: 'field' },
      ],
      [[{ source_type: 'whatsapp' }, { source_type: 'news' }]],
    );
    assert.equal(r.digital_darkness, false);
  });
});
