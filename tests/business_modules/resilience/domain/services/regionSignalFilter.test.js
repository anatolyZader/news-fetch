import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  filterSignalsForScope,
  isNorthSignal,
  normalizeReportScope,
} from '../../../../../business_modules/resilience/domain/services/regionSignalFilter.js';

describe('regionSignalFilter', () => {
  it('keeps national scope unfiltered', () => {
    const signals = [
      { source_type: 'news', evidence: 'Residents in Tel Aviv received guidance.' },
      { source_type: 'news', evidence: 'Residents in Kiryat Shmona entered shelters.' },
    ];

    assert.equal(filterSignalsForScope(signals, 'national').length, 2);
  });

  it('matches northern geography in news evidence', () => {
    assert.equal(
      isNorthSignal({ source_type: 'news', evidence: 'Kiryat Shmona residents entered shelters.' }),
      true,
    );
  });

  it('treats field and PBO signals as northern source data', () => {
    assert.equal(isNorthSignal({ source_type: 'field', evidence: 'Local team active.' }), true);
    assert.equal(isNorthSignal({ source_type: 'pbo', evidence: '[כרמיאל] רציפות תפקודית' }), true);
  });

  it('filters out non-northern signals for north scope', () => {
    const signals = [
      { source_type: 'news', evidence: 'Tel Aviv municipality published instructions.' },
      { source_type: 'news', evidence: 'Haifa hospital continued operating.' },
      { source_type: 'naftali', evidence: 'Weekly municipality report.' },
    ];

    assert.deepEqual(filterSignalsForScope(signals, 'north'), [signals[1], signals[2]]);
  });

  it('normalizes unknown scopes to national', () => {
    assert.equal(normalizeReportScope('north'), 'north');
    assert.equal(normalizeReportScope('unknown'), 'national');
  });
});
