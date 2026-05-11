import assert from 'node:assert/strict';
import test from 'node:test';

import { collectGeoVersionsFromSignals } from '../../../../../business_modules/geo/domain/services/geoReportDiagnostics.js';

test('collectGeoVersionsFromSignals dedupes and sorts', () => {
  const out = collectGeoVersionsFromSignals([
    { geo: { kind: 'resolved', geoReferenceVersion: 'b', borderReferenceVersion: 'bb' } },
    { geo: { kind: 'resolved', geoReferenceVersion: 'a', borderReferenceVersion: 'aa' } },
    { geo: { kind: 'resolved', geoReferenceVersion: 'b', borderReferenceVersion: 'bb' } },
    {},
  ]);
  assert.deepEqual(out.geo_reference_versions_used, ['a', 'b']);
  assert.deepEqual(out.border_reference_versions_used, ['aa', 'bb']);
});
