import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { IGeoNorthReferencePort } from '../../domain/ports/IGeoNorthReferencePort.js';
import { collectRawLocalitiesFromNorthReferenceDoc } from '../../domain/services/northReferenceDocShape.js';
import { isNorthSubregionId } from '../../domain/value_objects/northSubregionId.js';

/**
 * @param {{ dataDir: string }} opts
 */
export function createGeoNorthReferenceJsonAdapter({ dataDir }) {
  return new GeoNorthReferenceJsonAdapter(dataDir);
}

class GeoNorthReferenceJsonAdapter extends IGeoNorthReferencePort {
  /** @param {string} dataDir */
  constructor(dataDir) {
    super();
    this.dataDir = dataDir;
  }

  loadNorthGeoReference() {
    const refPath = join(this.dataDir, 'north-reference.json');
    const legacyPath = join(this.dataDir, 'north-localities.json');
    const borderPath = join(this.dataDir, 'north-border.json');

    let referenceVersion;
    let referenceSource = 'north-localities-v1';
    /** @type {unknown[]} */
    let rawLocalities;

    if (existsSync(refPath)) {
      const doc = JSON.parse(readFileSync(refPath, 'utf8'));
      referenceVersion = String(doc?.version ?? 'unknown').trim() || 'unknown';
      referenceSource = String(doc?.source ?? referenceSource).trim() || referenceSource;
      rawLocalities = collectRawLocalitiesFromNorthReferenceDoc(doc);
      if (rawLocalities.length === 0) {
        throw new Error('north-reference.json must include localities (subregions.*.localities or top-level localities)');
      }
    } else if (existsSync(legacyPath)) {
      const legacy = JSON.parse(readFileSync(legacyPath, 'utf8'));
      if (!Array.isArray(legacy)) {
        throw new Error('north-localities.json (legacy) must be a JSON array');
      }
      rawLocalities = legacy;
      referenceVersion = 'legacy-array';
      referenceSource = 'north-localities-legacy';
    } else {
      throw new Error(`Missing ${refPath} (or legacy north-localities.json)`);
    }

    const borderDoc = JSON.parse(readFileSync(borderPath, 'utf8'));
    const borderVersion =
      typeof borderDoc?.version === 'string' && borderDoc.version.trim()
        ? borderDoc.version.trim()
        : null;
    const coords = borderDoc?.coordinates;
    if (!Array.isArray(coords) || coords.length === 0) {
      throw new Error('north-border.json must include a non-empty coordinates array');
    }

    const border = coords.map((p) => {
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error('north-border coordinates must be numeric lat/lon');
      }
      return { lat, lon };
    });

    const localities = [];
    for (const row of rawLocalities) {
      const canonicalKey = String(row.canonicalKey ?? '').trim();
      const subregionId = String(row.subregionId ?? '').trim().toLowerCase();
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      const primaryNames = Array.isArray(row.names) ? row.names.map((n) => String(n).trim()).filter(Boolean) : [];
      const aliases = Array.isArray(row.aliases) ? row.aliases.map((n) => String(n).trim()).filter(Boolean) : [];
      const names = [...new Set([...primaryNames, ...aliases])];

      if (!canonicalKey || !isNorthSubregionId(subregionId) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error(`Invalid locality row for canonicalKey "${canonicalKey}"`);
      }
      if (names.length === 0) {
        throw new Error(`Locality "${canonicalKey}" must include at least one name or alias`);
      }
      localities.push({
        canonicalKey,
        names,
        lat,
        lon,
        subregionId,
        officialHebrewName: row.officialHebrewName == null ? undefined : String(row.officialHebrewName).trim(),
        municipalityType: row.municipalityType == null ? undefined : String(row.municipalityType).trim(),
        geoEntityType: row.geoEntityType != null && String(row.geoEntityType).trim() ? String(row.geoEntityType).trim() : undefined,
        parentCouncilKey:
          row.parentCouncilKey != null && String(row.parentCouncilKey).trim()
            ? String(row.parentCouncilKey).trim()
            : null,
      });
    }

    return {
      referenceVersion,
      referenceSource,
      borderVersion,
      localities,
      border,
    };
  }
}
