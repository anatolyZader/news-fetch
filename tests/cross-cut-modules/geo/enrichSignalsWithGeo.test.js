import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { enrichSignalsWithGeo } from '../../../cross-cut-modules/geo/enrichSignalsWithGeo.js';
import { shouldAttachGeoToSignal } from '../../../cross-cut-modules/geo/geoAttachPolicy.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('shouldAttachGeoToSignal skips signals that already have geo', () => {
  assert.equal(shouldAttachGeoToSignal({ source_type: 'news', geo: { kind: 'unknown' } }), false);
  assert.equal(shouldAttachGeoToSignal({ source_type: 'field', evidence: 'x' }), true);
});

test('enrichSignalsWithGeo attaches geo envelope to pbo municipality signal', () => {
  const { signals, attached, resolved } = enrichSignalsWithGeo(
    [
      {
        source_type: 'pbo',
        municipality: 'כרמיאל',
        evidence: '[כרמיאל] service continuity',
        signal_type: 'service_continuity',
      },
    ],
    { rootDir: ROOT, unknownSourceType: 'test' },
  );
  assert.equal(attached, 1);
  assert.ok(signals[0].geo);
  assert.equal(signals[0].geo.kind, 'resolved');
  assert.ok(resolved >= 1);
});
