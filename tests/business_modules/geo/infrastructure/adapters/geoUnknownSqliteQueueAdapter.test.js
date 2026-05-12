import assert from 'node:assert/strict';
import test from 'node:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';

import { createGeoUnknownSqliteQueueAdapter } from '../../../../../business_modules/geo/infrastructure/adapters/geoUnknownSqliteQueueAdapter.js';

test('GeoUnknownSqliteQueueAdapter upserts and increments occurrence_count', () => {
  const dbPath = join(tmpdir(), `geo-unknown-queue-${Date.now()}.sqlite`);
  try {
    const sink = createGeoUnknownSqliteQueueAdapter({ dbPath, sourceType: 'whatsapp' });
    sink.recordUnknown({
      kind: 'unknown',
      reason: 'NO_MATCH',
      rawName: 'מקום לא ידוע',
      geoReferenceVersion: 'v1',
      source: 's',
    });
    sink.recordUnknown({
      kind: 'unknown',
      reason: 'NO_MATCH',
      rawName: 'מקום לא ידוע',
      geoReferenceVersion: 'v1',
      source: 's',
    });

    const db = new DatabaseSync(dbPath);
    const row = db.prepare(
      `SELECT occurrence_count as n, raw_name_last as last, reason, source_type as st
       FROM geo_unknown_review
       WHERE raw_name_norm = ?`,
    ).get('מקום לא ידוע');
    assert.equal(row.n, 2);
    assert.equal(row.last, 'מקום לא ידוע');
    assert.equal(row.reason, 'NO_MATCH');
    assert.equal(row.st, 'whatsapp');
  } finally {
    try { unlinkSync(dbPath); } catch { /* ignore */ }
  }
});

