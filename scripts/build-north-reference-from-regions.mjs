#!/usr/bin/env node
/**
 * Merge regions.json municipalities into north-reference.json localities with lat/lon.
 * Geocodes via Nominatim (OSM) — respect https://operations.osmfoundation.org/policies/nominatim/ (1 req/s, valid User-Agent).
 *
 * Usage:
 *   node scripts/build-north-reference-from-regions.mjs
 *   node scripts/build-north-reference-from-regions.mjs --dry-run   # print only, no write
 *
 * Reads:  regions.json (repo root)
 * Writes: business_modules/geo/data/north-reference.json (hierarchical subregions.*.localities; merges by canonicalKey)
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  collectRawLocalitiesFromNorthReferenceDoc,
  groupLocalitiesIntoSubregionsForFile,
} from '../business_modules/geo/domain/services/northReferenceDocShape.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const REGIONS_PATH = resolve(root, 'regions.json');
const REF_PATH = resolve(root, 'business_modules', 'geo', 'data', 'north-reference.json');

/** Hebrew region key in regions.json → geo subregionId */
const REGION_KEY_TO_SUBREGION = {
  'גלמ"ע': 'galma',
  גלמע: 'galma',
  חירם: 'hiram',
  בראם: 'baram',
  נפתלי: 'naftali',
  גולן: 'golan',
};

/** Prefer stable canonicalKey + merge with existing rows (avoids duplicate localities). */
const HEBREW_NAME_TO_CANONICAL = {
  'קרית שמונה': 'kiryat_shmona',
  'קריית שמונה': 'kiryat_shmona',
  קצרין: 'katzrin',
  צפת: 'safed',
  מטולה: 'metula',
};

/** Hebrew names in regions.json that are regional councils (reference pin is centroid proxy). */
const REGIONAL_COUNCIL_NAMES = new Set(['גולן']);
const MANUAL_COORDS = {
  גולן: {
    lat: 32.994,
    lon: 35.688,
    note: "Representative point near Katzrin; regional council 'גולן', not a street named Golan.",
  },
  "בועינה - נוג'ידת": { lat: 32.8062, lon: 35.3649 },
  'בועינה נוגידת': { lat: 32.8062, lon: 35.3649 },
};

const USER_AGENT = 'news-fetch-geo-build/1.0 (locality reference; contact: dev)';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function slugifyHebrewName(name) {
  const n = String(name ?? '')
    .trim()
    .replace(/["'`׳״]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^\u0590-\u05FFa-zA-Z0-9_()-]/g, '');
  return n || 'locality';
}

async function nominatimSearch(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'il');
  url.searchParams.set('q', query);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}: ${query}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const hit = data[0];
  const lat = parseFloat(hit.lat);
  const lon = parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, displayName: hit.display_name };
}

async function geocodeMunicipality(hebrewName, _subregionId) {
  const manual = MANUAL_COORDS[hebrewName];
  if (manual) {
    return { lat: manual.lat, lon: manual.lon, displayName: 'manual' };
  }
  const queries = [
    `${hebrewName}, ישראל`,
    `${hebrewName}, Israel`,
    hebrewName,
  ];
  for (const q of queries) {
    const r = await nominatimSearch(q);
    if (r) return r;
    await sleep(1100);
  }
  return null;
}

function loadRegions() {
  const doc = JSON.parse(readFileSync(REGIONS_PATH, 'utf8'));
  const out = [];
  for (const [regionKey, region] of Object.entries(doc.regions ?? {})) {
    const sub = REGION_KEY_TO_SUBREGION[regionKey];
    if (!sub) {
      console.warn(`Unknown region key (add mapping): ${JSON.stringify(regionKey)}`);
      continue;
    }
    for (const m of region.municipalities ?? []) {
      out.push({ hebrewName: String(m).trim(), subregionId: sub, regionKey });
    }
  }
  return out;
}

function loadExistingReference() {
  try {
    return JSON.parse(readFileSync(REF_PATH, 'utf8'));
  } catch {
    return { version: 'north-geo-generated', source: 'north-localities-v1' };
  }
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const rows = loadRegions();
  const ref = loadExistingReference();
  /** @type {Map<string, Record<string, unknown>>} */
  let byKey = new Map();
  try {
    const flat = collectRawLocalitiesFromNorthReferenceDoc(ref);
    byKey = new Map(flat.map((l) => [l.canonicalKey, l]));
  } catch {
    // No prior reference (or empty) — build from scratch
  }

  return (async () => {
    const built = [];
    for (const { hebrewName, subregionId, regionKey } of rows) {
      let canonicalKey = HEBREW_NAME_TO_CANONICAL[hebrewName];
      if (!canonicalKey) {
        const baseSlug = slugifyHebrewName(hebrewName);
        canonicalKey = baseSlug.toLowerCase().replace(/[()]/g, '').replace(/_+/g, '_');
        if (!/^[a-z0-9_]/.test(canonicalKey)) {
          canonicalKey = `he_${Buffer.from(hebrewName, 'utf8').toString('hex').slice(0, 24)}`;
        }
      }

      if (byKey.has(canonicalKey)) {
        const existing = byKey.get(canonicalKey);
        if (existing.subregionId !== subregionId) {
          console.warn(`Key collision or subregion mismatch: ${canonicalKey} (${hebrewName}) was ${existing.subregionId}, regions.json says ${subregionId}`);
        }
        built.push(existing);
        continue;
      }

      console.error(`Geocoding: ${hebrewName} (${subregionId}) …`);
      const geo = await geocodeMunicipality(hebrewName, subregionId);
      await sleep(1100);

      if (!geo) {
        console.error(`  FAILED: ${hebrewName}`);
        built.push({
          canonicalKey,
          officialHebrewName: hebrewName,
          names: [hebrewName],
          lat: null,
          lon: null,
          subregionId,
          municipalityType: 'unknown',
          parentCouncilKey: null,
          _geocodeFailed: true,
          _regionKey: regionKey,
        });
        continue;
      }

      const locality = {
        canonicalKey,
        officialHebrewName: hebrewName,
        names: [hebrewName],
        lat: Math.round(geo.lat * 1e6) / 1e6,
        lon: Math.round(geo.lon * 1e6) / 1e6,
        subregionId,
        municipalityType: 'municipality',
        parentCouncilKey: null,
      };
      if (REGIONAL_COUNCIL_NAMES.has(hebrewName)) {
        locality.geoEntityType = 'regional_council';
      }
      const m = MANUAL_COORDS[hebrewName];
      if (m?.note) locality.note = m.note;
      byKey.set(canonicalKey, locality);
      built.push(locality);
      console.error(`  OK: ${geo.lat}, ${geo.lon}`);
    }

    const merged = [...byKey.values()].filter((l) => l.lat != null && l.lon != null);
    const failed = [...byKey.values()].filter((l) => l._geocodeFailed);
    if (failed.length) {
      console.error(`\n${failed.length} municipalities failed geocoding — fix manually or re-run:`);
      for (const f of failed) console.error(`  - ${f.officialHebrewName}`);
    }

    const next = {
      version: ref.version || 'north-geo-generated',
      source: ref.source || 'north-localities-v1',
      description:
        'Northern locality reference: municipalities from regions.json, geocoded via Nominatim. Bump version when editing rows.',
      schema: 'north-reference-subregions-v1',
      _meta: {
        generated_from: 'regions.json',
        nominatim: 'https://nominatim.openstreetmap.org',
        generated_at: new Date().toISOString(),
      },
      subregions: groupLocalitiesIntoSubregionsForFile(merged),
    };

    if (dryRun) {
      console.log(JSON.stringify(next, null, 2));
      return;
    }
    writeFileSync(REF_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    console.error(`Wrote ${merged.length} localities under subregions.* to ${REF_PATH}`);
  })();
}

main();
