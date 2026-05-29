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

function loadRawLocalities(dataDir) {
  const refPath = join(dataDir, 'north-reference.json');
  const legacyPath = join(dataDir, 'north-localities.json');

  if (existsSync(refPath)) {
    const doc = JSON.parse(readFileSync(refPath, 'utf8'));
    const rawLocalities = collectRawLocalitiesFromNorthReferenceDoc(doc);
    if (rawLocalities.length === 0) {
      throw new Error('north-reference.json must include localities (subregions.*.localities or top-level localities)');
    }
    return {
      rawLocalities,
      referenceVersion: String(doc?.version ?? 'unknown').trim() || 'unknown',
      referenceSource: String(doc?.source ?? 'north-localities-v1').trim() || 'north-localities-v1',
    };
  }

  if (existsSync(legacyPath)) {
    const legacy = JSON.parse(readFileSync(legacyPath, 'utf8'));
    if (!Array.isArray(legacy)) {
      throw new TypeError('north-localities.json (legacy) must be a JSON array');
    }
    return {
      rawLocalities: legacy,
      referenceVersion: 'legacy-array',
      referenceSource: 'north-localities-legacy',
    };
  }

  throw new Error(`Missing ${refPath} (or legacy north-localities.json)`);
}

function loadBorder(dataDir) {
  const borderPath = join(dataDir, 'north-border.json');
  const borderDoc = JSON.parse(readFileSync(borderPath, 'utf8'));
  const borderVersion =
    typeof borderDoc?.version === 'string' && borderDoc.version.trim()
      ? borderDoc.version.trim()
      : null;
  const coords = borderDoc?.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) {
    throw new TypeError('north-border.json must include a non-empty coordinates array');
  }
  const border = coords.map((p) => {
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new TypeError('north-border coordinates must be numeric lat/lon');
    }
    return { lat, lon };
  });
  return { borderVersion, border };
}

function parseLocalityRow(row) {
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
  return {
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
  };
}

class GeoNorthReferenceJsonAdapter extends IGeoNorthReferencePort {
  /** @param {string} dataDir */
  constructor(dataDir) {
    super();
    this.dataDir = dataDir;
  }

  loadNorthGeoReference() {
    const { rawLocalities, referenceVersion, referenceSource } = loadRawLocalities(this.dataDir);
    const { borderVersion, border } = loadBorder(this.dataDir);
    const localities = rawLocalities.map(parseLocalityRow);

    return {
      referenceVersion,
      referenceSource,
      borderVersion,
      localities,
      border,
    };
  }
}
