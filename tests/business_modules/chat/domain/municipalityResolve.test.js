import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveMunicipalityName,
  signalMatchesMunicipality,
  extractMunicipalityFromMessage,
} from '../../../../business_modules/chat/domain/municipalityResolve.js';

describe('municipalityResolve', () => {
  it('resolves Kiryat Shmona alias', () => {
    const name = resolveMunicipalityName('Kiryat Shmona', { pboLookupKeys: ['קריית שמונה'] });
    assert.equal(name, 'קריית שמונה');
  });

  it('matches signal geo canonicalKey', () => {
    const signal = {
      evidence: 'unrelated',
      geo: { canonicalKey: 'kiryat_shmona', matchedName: 'קריית שמונה' },
    };
    assert.equal(signalMatchesMunicipality(signal, 'Kiryat Shmona'), true);
  });

  it('extracts municipality from message text', () => {
    const m = extractMunicipalityFromMessage(
      'how did information change in Kiryat Shmona throughout all dates',
      { pboLookupKeys: [] },
    );
    assert.ok(m);
    assert.match(String(m), /shmona|שמונה/i);
  });
});
