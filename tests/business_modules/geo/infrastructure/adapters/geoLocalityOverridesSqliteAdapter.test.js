import assert from 'node:assert/strict';
import test from 'node:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';

import { createGeoLocalityOverridesSqliteAdapter } from '../../../../../business_modules/geo/infrastructure/adapters/geoLocalityOverridesSqliteAdapter.js';

test('GeoLocalityOverridesSqliteAdapter lookupOverride returns active mapping', () => {
  const dbPath = join(tmpdir(), `geo-overrides-${Date.now()}.sqlite`);
  try {
    // Pre-seed table with an active override.
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS geo_locality_overrides (
        id INTEGER PRIMARY KEY,
        raw_variant_norm TEXT NOT NULL,
        raw_variant_last TEXT,
        canonical_key TEXT NOT NULL,
        geo_entity_type TEXT NOT NULL DEFAULT 'locality',
        approved_by TEXT,
        approved_at TEXT,
        reason TEXT,
        active INTEGER NOT NULL DEFAULT 1
      );
    `);
    db.prepare(
      `INSERT INTO geo_locality_overrides (raw_variant_norm, raw_variant_last, canonical_key, geo_entity_type, active)
       VALUES (?, ?, ?, ?, 1)`,
    ).run('קרית שמונה', 'קרית שמונה', 'kiryat_shmona', 'locality');

    const adapter = createGeoLocalityOverridesSqliteAdapter({ dbPath });
    const out = adapter.lookupOverride('קרית שמונה', 'קרית שמונה');
    assert.deepEqual(out, { canonicalKey: 'kiryat_shmona', geoEntityType: 'locality' });
  } finally {
    try { unlinkSync(dbPath); } catch { /* ignore */ }
  }
});

