import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { createGeoNorthReferenceJsonAdapter } from '../../../../../business_modules/geo/infrastructure/adapters/geoNorthReferenceJsonAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '../../../../../business_modules/geo/data');

test('geoNorthReferenceJsonAdapter loads stub localities and border', () => {
  const adapter = createGeoNorthReferenceJsonAdapter({ dataDir });
  const { localities, border, referenceVersion, referenceSource, borderVersion } =
    adapter.loadNorthGeoReference();
  assert.ok(localities.length >= 1);
  assert.ok(border.length >= 2);
  assert.equal(localities.find((r) => r.canonicalKey === 'katzrin')?.subregionId, 'golan');
  assert.ok(String(referenceVersion).length > 0);
  assert.ok(String(referenceSource).length > 0);
  assert.ok(borderVersion != null);
  assert.ok(localities.find((r) => r.canonicalKey === 'kiryat_shmona')?.names.includes('ק שמונה'));
});
