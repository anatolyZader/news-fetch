import { distanceKmToPolyline } from '../domain/services/distanceKmToPolyline.js';
import { distanceBandForKm } from '../domain/services/distanceBand.js';
import { geoAreaTagsForPboSubregion } from '../domain/services/geoAreaTagsForPboSubregion.js';
import {
  buildLookupIndex,
  normalizeLocalityLookupKey,
  resolveByExactStages,
  resolveByFuzzyBest,
} from '../domain/services/resolveLocalityMatch.js';
import { deriveGeoQualityFields, deriveScopeConfidence } from '../domain/services/geoQualityPolicy.js';
import { validateGeoEnvelope } from '../domain/value_objects/geoEnrichmentSchema.js';
import { isGolanSubregionId } from '../domain/value_objects/northSubregionId.js';

/**
 * @param {import('../domain/value_objects/geoEnrichment.js').NorthLocalityRow} row
 * @param {string} rawInput
 * @returns {string}
 */
function pickMatchedDisplayName(row, rawInput) {
  const key = normalizeLocalityLookupKey(rawInput);
  for (const name of row.names ?? []) {
    if (normalizeLocalityLookupKey(name) === key) return name;
  }
  return row.officialHebrewName || row.names[0];
}

/**
 * @param {{ northReferencePort: import('../domain/ports/IGeoNorthReferencePort.js').IGeoNorthReferencePort }} deps
 */
export function createGeoService({ northReferencePort }) {
  const bundle = northReferencePort.loadNorthGeoReference();
  const {
    localities,
    border,
    referenceVersion: refVer,
    referenceSource: refSrc,
    borderVersion: bVer,
  } = bundle;
  const referenceVersion = refVer ?? 'unknown';
  const referenceSource = refSrc ?? 'unknown';
  const borderVersion = bVer ?? null;
  const index = buildLookupIndex(localities);
  const legacySub = String(process.env.GEO_LEGACY_SUBREGION_ID ?? '1').trim().toLowerCase();
  const emitLegacySubregionId = legacySub !== '0' && legacySub !== 'false';

  function assertValidGeo(o) {
    const v = validateGeoEnvelope(o);
    if (!v.ok) {
      throw new Error(`internal geo envelope invalid: ${v.errors.join('; ')}`);
    }
    return o;
  }

  function unknown(reason, rawName, candidates) {
    /** @type {import('../domain/value_objects/geoEnrichment.js').GeoUnknown} */
    const out = {
      kind: 'unknown',
      reason,
      rawName: rawName == null ? null : String(rawName),
      geoReferenceVersion: referenceVersion,
      source: referenceSource,
    };
    if (candidates?.length) out.candidates = candidates;
    return assertValidGeo(out);
  }

  return {
    distanceBandForKm,

    /**
     * @param {string|null|undefined} rawName
     * @returns {import('../domain/value_objects/geoEnrichment.js').GeoResolved | import('../domain/value_objects/geoEnrichment.js').GeoUnknown}
     */
    resolveLocalityName(rawName) {
      const trimmed = String(rawName ?? '').trim();
      if (!trimmed) {
        return unknown('NO_LOCALITY', null, undefined);
      }

      const exact = resolveByExactStages(index, trimmed);
      let hit = exact;
      /** @type {number | undefined} */
      let fuzzyCandidateCount;
      if (!hit) {
        const fuzzy = resolveByFuzzyBest(localities, trimmed);
        if ('row' in fuzzy) {
          fuzzyCandidateCount = fuzzy.candidateCount;
          hit = { row: fuzzy.row, matchMethod: fuzzy.matchMethod, matchConfidence: fuzzy.matchConfidence };
        } else if (fuzzy.candidates?.length) {
          return unknown('NO_CONFIDENT_MATCH', trimmed, fuzzy.candidates);
        }
      }

      if (!hit) {
        return unknown('NO_MATCH', trimmed, undefined);
      }

      const row = hit.row;
      const distanceKmToNorthBorder = distanceKmToPolyline(row.lat, row.lon, border);
      const pboSubregionId = row.subregionId;

      const matchMethod =
        hit.matchMethod === 'exact' ||
        hit.matchMethod === 'punctuation' ||
        hit.matchMethod === 'hebrew_final' ||
        hit.matchMethod === 'fuzzy'
          ? hit.matchMethod
          : 'exact';
      const matchConfidence = hit.matchConfidence;
      const { quality, usableForMetrics, requiresReview } = deriveGeoQualityFields({
        matchMethod,
        matchConfidence,
      });
      const scopeConfidence = deriveScopeConfidence({ usableForMetrics, requiresReview });
      const matchedVariant = pickMatchedDisplayName(row, trimmed);
      const candidateCount =
        matchMethod === 'fuzzy' && Number.isFinite(fuzzyCandidateCount) ? fuzzyCandidateCount : 1;

      /** @type {import('../domain/value_objects/geoEnrichment.js').GeoResolved} */
      const resolved = {
        kind: 'resolved',
        geoEntityType: 'locality',
        matchEvidence: {
          rawInput: trimmed,
          normalizedInput: normalizeLocalityLookupKey(trimmed),
          matchedVariant,
          candidateCount,
        },
        scopeConfidence,
        geoReferenceVersion: referenceVersion,
        borderReferenceVersion: borderVersion,
        source: referenceSource,
        canonicalKey: row.canonicalKey,
        matchedName: matchedVariant,
        pboSubregionId,
        geoAreaTags: geoAreaTagsForPboSubregion(pboSubregionId),
        distanceKmToNorthBorder,
        distanceBand: distanceBandForKm(distanceKmToNorthBorder),
        isGolan: isGolanSubregionId(pboSubregionId),
        matchMethod,
        matchConfidence,
        quality,
        usableForMetrics,
        requiresReview,
      };
      if (emitLegacySubregionId) {
        resolved.subregionId = pboSubregionId;
      }
      return assertValidGeo(resolved);
    },
  };
}
