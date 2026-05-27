import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { IGeoLocalityOverridesPort } from '../../domain/ports/IGeoLocalityOverridesPort.js';

const DDL = `
CREATE TABLE IF NOT EXISTS geo_locality_overrides (
  id              INTEGER PRIMARY KEY,
  raw_variant_norm TEXT    NOT NULL,
  raw_variant_last TEXT,
  canonical_key    TEXT    NOT NULL,
  geo_entity_type  TEXT    NOT NULL DEFAULT 'locality',
  approved_by      TEXT,
  approved_at      TEXT,
  reason           TEXT,
  active           INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_geo_locality_overrides_norm_active
  ON geo_locality_overrides(raw_variant_norm)
  WHERE active = 1;
`;

/**
 * @param {{ dbPath: string }} opts
 */
export function createGeoLocalityOverridesSqliteAdapter({ dbPath }) {
  return new GeoLocalityOverridesSqliteAdapter(dbPath);
}

class GeoLocalityOverridesSqliteAdapter extends IGeoLocalityOverridesPort {
  /** @param {string} dbPath */
  constructor(dbPath) {
    super();
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(DDL);
  }

  /** @inheritdoc */
  lookupOverride(_rawInput, normalizedInput) {
    const norm = String(normalizedInput ?? '').trim();
    if (!norm) return null;
    const stmt = this.db.prepare(
      `SELECT canonical_key as canonicalKey, geo_entity_type as geoEntityType
       FROM geo_locality_overrides
       WHERE raw_variant_norm = ? AND active = 1
       LIMIT 1`,
    );
    const row = stmt.get(norm);
    if (!row?.canonicalKey) return null;
    return {
      canonicalKey: String(row.canonicalKey),
      geoEntityType: row.geoEntityType != null ? String(row.geoEntityType) : undefined,
    };
  }
}

