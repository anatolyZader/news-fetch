import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveStateStore } from '../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';
import { normalizeLocalityLookupKey } from './resolveLocalityMatch.js';
import { GEO_ENVELOPE_SCHEMA_VERSION } from '../value_objects/geoEnvelopeVersion.js';
import { GEO_POLICY_VERSION } from './geoQualityPolicy.js';
import { geoAreaTagsForPboSubregion } from './geoAreaTagsForPboSubregion.js';
import { buildGeoScopeDecision } from './geoScopeDecisionFromResolved.js';
import { isGolanSubregionId } from '../value_objects/northSubregionId.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}

const DEFAULT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/landmark-gazetteer.json',
);

/** @type {Map<string, object> | null} */
let lookupIndex = null;

export function landmarkGazetteerEnabled(env = process.env) {
  return env.GEO_LANDMARK_GAZETTEER !== '0';
}

function loadGazetteerIndex(gazetteerPath = DEFAULT_PATH) {
  if (lookupIndex && gazetteerPath === DEFAULT_PATH) return lookupIndex;
  const index = new Map();
  if (!getStore().existsSync(gazetteerPath)) {
    lookupIndex = index;
    return index;
  }
  try {
    const doc = JSON.parse(getStore().readFileSync(gazetteerPath, 'utf8'));
    for (const lm of doc?.landmarks ?? []) {
      const entry = {
        id: String(lm.id ?? '').trim(),
        displayName: String(lm.displayName ?? lm.id ?? '').trim(),
        landmarkType: String(lm.landmarkType ?? 'area').trim(),
        probableDistrict: String(lm.probableDistrict ?? 'north').trim(),
        probableSubregionId: String(lm.probableSubregionId ?? 'unknown').trim(),
        geoEntityType: String(lm.geoEntityType ?? 'area').trim(),
      };
      for (const name of lm.names ?? []) {
        const key = normalizeLocalityLookupKey(name);
        if (key.length >= 2) index.set(key, entry);
      }
    }
  } catch {
    // leave empty
  }
  if (gazetteerPath === DEFAULT_PATH) lookupIndex = index;
  return index;
}

export function resetLandmarkGazetteerCache() {
  lookupIndex = null;
}

/**
 * @param {string|null|undefined} rawName
 * @returns {object|null}
 */
export function matchLandmarkGazetteer(rawName) {
  if (!landmarkGazetteerEnabled()) return null;
  const trimmed = String(rawName ?? '').trim();
  if (!trimmed) return null;
  const key = normalizeLocalityLookupKey(trimmed);
  const direct = loadGazetteerIndex().get(key);
  if (direct) return direct;
  for (const [aliasKey, entry] of loadGazetteerIndex()) {
    if (key.includes(aliasKey) || aliasKey.includes(key)) return entry;
  }
  return null;
}

/**
 * @param {string} rawName
 * @param {object} landmark
 * @param {{ provenance?: string, resolutionScope?: string, referenceVersion?: string, referenceSource?: string }} [options]
 */
export function buildProvisionalGeoFromLandmark(rawName, landmark, options = {}) {
  const trimmed = String(rawName ?? '').trim();
  const provenance = String(options.provenance ?? 'text_inferred').trim();
  const resolutionScope = options.resolutionScope;
  const pboSubregionId = landmark.probableSubregionId;
  const geoEntityType = landmark.geoEntityType ?? 'area';

  const resolution = {
    rawInput: trimmed,
    normalizedInput: normalizeLocalityLookupKey(trimmed),
    probableDistrict: landmark.probableDistrict,
    probableSubregionId: pboSubregionId,
    matchedName: landmark.displayName,
    matchedVariant: landmark.displayName,
    matchMethod: 'landmark_gazetteer',
    matchConfidence: 0.6,
    candidateCount: 1,
    geoEntityType,
    provenance,
    landmarkId: landmark.id,
    landmarkType: landmark.landmarkType,
  };
  if (resolutionScope === 'signal' || resolutionScope === 'message') {
    resolution.scope = resolutionScope;
  }

  const provisional = {
    kind: 'provisional',
    envelopeSchemaVersion: GEO_ENVELOPE_SCHEMA_VERSION,
    geoEntityType,
    resolution,
    classification: {
      pboSubregionId,
      geoAreaTags: geoAreaTagsForPboSubregion(pboSubregionId),
      isGolan: isGolanSubregionId(pboSubregionId),
      distanceKmToNorthBorder: 500,
      distanceBand: 'far',
    },
    policy: {
      geoPolicyVersion: GEO_POLICY_VERSION,
      quality: 'low',
      usableForMetrics: false,
      requiresReview: true,
      scopeConfidence: 'low',
      decisionReasons: [`landmark_gazetteer:${landmark.id}`, 'provisional_not_verified'],
    },
    audit: {
      geoReferenceVersion: options.referenceVersion ?? 'landmark-gazetteer-v1',
      source: options.referenceSource ?? 'landmark-gazetteer',
      resolvedAt: new Date().toISOString(),
    },
    matchEvidence: {
      rawInput: trimmed,
      normalizedInput: normalizeLocalityLookupKey(trimmed),
      matchedVariant: landmark.displayName,
      candidateCount: 1,
    },
  };

  provisional.scopeDecision = buildGeoScopeDecision({
    kind: 'resolved',
    geoEntityType,
    classification: provisional.classification,
    policy: provisional.policy,
    resolution: {
      ...resolution,
      canonicalKey: `landmark:${landmark.id}`,
    },
  });
  if (provisional.scopeDecision) {
    provisional.scopeDecision.usableForMetrics = false;
    provisional.scopeDecision.confidence = 'low';
    provisional.scopeDecision.reasons = [
      ...(provisional.scopeDecision.reasons ?? []),
      'provisional_landmark',
    ];
  }

  return provisional;
}
