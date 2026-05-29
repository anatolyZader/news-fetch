import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLocalityLookupKey } from '../services/resolveLocalityMatch.js';
import { GEO_ENVELOPE_SCHEMA_VERSION } from '../value_objects/geoEnvelopeVersion.js';
import { GEO_POLICY_VERSION } from '../services/geoQualityPolicy.js';
import { distanceBandForKm } from '../services/distanceBand.js';
import { loadDistanceBandPolicy } from '../services/loadDistanceBandPolicy.js';

const distanceBandPolicy = loadDistanceBandPolicy();
/** Sentinel distance for non-north district stubs (metrics use geo tags, not distance). */
const STUB_DISTANCE_KM = 500;
const STUB_DISTANCE_BAND = distanceBandForKm(STUB_DISTANCE_KM, distanceBandPolicy);

const DEFAULT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/homefront-district-stubs.json',
);

/** @type {Map<string, { districtId: string, canonicalKey: string, displayName: string }> | null} */
let lookupIndex = null;

function loadStubIndex(stubsPath = DEFAULT_PATH) {
  if (lookupIndex && stubsPath === DEFAULT_PATH) return lookupIndex;
  const index = new Map();
  if (!existsSync(stubsPath)) {
    lookupIndex = index;
    return index;
  }
  try {
    const doc = JSON.parse(readFileSync(stubsPath, 'utf8'));
    for (const [districtId, block] of Object.entries(doc?.districts ?? {})) {
      for (const loc of block?.localities ?? []) {
        const canonicalKey = String(loc?.canonicalKey ?? '').trim();
        for (const name of loc?.names ?? []) {
          const key = normalizeLocalityLookupKey(name);
          if (key.length >= 2) {
            index.set(key, {
              districtId: String(districtId).trim().toLowerCase(),
              canonicalKey,
              displayName: String(name).trim(),
            });
          }
        }
      }
    }
  } catch {
    // leave empty
  }
  if (stubsPath === DEFAULT_PATH) lookupIndex = index;
  return index;
}

/** Reset cached index (tests). */
export function resetHomefrontDistrictStubCache() {
  lookupIndex = null;
}

/**
 * @param {string|null|undefined} rawName
 * @returns {{ districtId: string, canonicalKey: string, displayName: string } | null}
 */
export function matchHomefrontDistrictStub(rawName) {
  const trimmed = String(rawName ?? '').trim();
  if (!trimmed) return null;
  const key = normalizeLocalityLookupKey(trimmed);
  return loadStubIndex().get(key) ?? null;
}

/**
 * Build a minimal resolved geo envelope from a district stub match.
 * @param {string} rawName
 * @param {{ districtId: string, canonicalKey: string, displayName: string }} stub
 * @param {{ provenance?: string, sourceType?: string, resolutionScope?: string }} [options]
 */
export function buildResolvedGeoFromDistrictStub(rawName, stub, options = {}) {
  const trimmed = String(rawName ?? '').trim();
  const provenance = String(options.provenance ?? 'structured').trim();
  const resolutionScope = options.resolutionScope;

  /** @type {import('../value_objects/geoEnrichment.js').GeoResolution} */
  const resolution = {
    rawInput: trimmed,
    normalizedInput: normalizeLocalityLookupKey(trimmed),
    canonicalKey: stub.canonicalKey,
    matchedName: stub.displayName,
    matchedVariant: stub.displayName,
    matchMethod: 'exact',
    matchConfidence: 1,
    candidateCount: 1,
    geoEntityType: 'locality',
    provenance,
  };
  if (resolutionScope === 'signal' || resolutionScope === 'message') {
    resolution.scope = resolutionScope;
  }

  return {
    kind: 'resolved',
    envelopeSchemaVersion: GEO_ENVELOPE_SCHEMA_VERSION,
    geoEntityType: 'locality',
    resolution,
    classification: {
      pboSubregionId: `homefront_${stub.districtId}`,
      geoAreaTags: [stub.districtId],
      isGolan: false,
      distanceKmToNorthBorder: STUB_DISTANCE_KM,
      distanceBand: STUB_DISTANCE_BAND,
      distancePolicyVersion: distanceBandPolicy.version,
    },
    policy: {
      geoPolicyVersion: GEO_POLICY_VERSION,
      quality: 'medium',
      usableForMetrics: provenance !== 'text_inferred',
      requiresReview: false,
      scopeConfidence: 'high',
      decisionReasons: [`homefront_district_stub:${stub.districtId}`],
    },
    audit: {
      geoReferenceVersion: 'homefront-district-stubs-v1',
      source: 'homefront-district-stubs',
      resolvedAt: new Date().toISOString(),
    },
    matchEvidence: {
      rawInput: trimmed,
      normalizedInput: normalizeLocalityLookupKey(trimmed),
      matchedVariant: stub.displayName,
      candidateCount: 1,
    },
  };
}
