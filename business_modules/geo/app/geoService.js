import { distanceKmToPolyline } from '../domain/services/distanceKmToPolyline.js';
import { distanceBandForKm } from '../domain/services/distanceBand.js';
import { loadDistanceBandPolicy } from '../domain/services/loadDistanceBandPolicy.js';
import { geoAreaTagsForPboSubregion } from '../domain/services/geoAreaTagsForPboSubregion.js';
import {
  buildFuzzyPrefixBuckets,
  buildLookupIndex,
  normalizeLocalityLookupKey,
  pickCandidateInSubregion,
  resolveByExactStages,
  resolveByFuzzyBest,
} from '../domain/services/resolveLocalityMatch.js';
import { GEO_ENVELOPE_SCHEMA_VERSION } from '../domain/value_objects/geoEnvelopeVersion.js';
import { deriveGeoQualityFields, deriveScopeConfidence, FUZZY_METRICS_MIN_CONFIDENCE, GEO_POLICY_VERSION } from '../domain/services/geoQualityPolicy.js';
import {
  coalesceGeoEntityTypeHint,
  distanceSemanticsForGeoEntityType,
  resolveReferenceGeoEntityType,
} from '../domain/services/referenceGeoEntityType.js';
import { buildGeoScopeDecision } from '../domain/services/geoScopeDecisionFromResolved.js';
import { validateGeoEnvelope } from '../domain/value_objects/geoEnrichmentSchema.js';
import { isGolanSubregionId } from '../domain/value_objects/northSubregionId.js';
import { GEO_PROVENANCE } from '../domain/value_objects/geoProvenance.js';

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

function assertValidGeo(o) {
  const v = validateGeoEnvelope(o);
  if (!v.ok) {
    throw new Error(`internal geo envelope invalid: ${v.errors.join('; ')}`);
  }
  return o;
}

/**
 * Best-effort classification of obviously non-locality area terms.
 * @param {string} s
 * @returns {{ reason: string, geoEntityType: string } | null}
 */
function classifyNonLocalityTerm(s) {
  const t = normalizeLocalityLookupKey(s);
  if (!t) return null;
  if (t === 'צפון' || t === 'הצפון' || t === 'north' || t === 'northern israel') {
    return { reason: 'NON_LOCALITY_AREA_TERM', geoEntityType: 'area' };
  }
  if (t === 'הגליל' || t === 'גליל' || t === 'upper galilee' || t === 'western galilee' || t === 'galilee') {
    return { reason: 'NON_LOCALITY_AREA_TERM', geoEntityType: 'area' };
  }
  if (t === 'גולן' || t === 'רמת הגולן' || t === 'golan' || t === 'golan heights') {
    return { reason: 'NON_LOCALITY_AREA_TERM', geoEntityType: 'area' };
  }
  return null;
}

/**
 * @param {{
 *   referenceVersion: string,
 *   referenceSource: string,
 * }} ctx
 */
function buildUnknownGeo(ctx, reason, rawName, candidates, resolutionHint) {
  const resolvedAt = new Date().toISOString();
  /** @type {import('../domain/value_objects/geoEnrichment.js').GeoUnknown} */
  const out = {
    kind: 'unknown',
    reason,
    rawName: rawName == null ? null : String(rawName),
    geoReferenceVersion: ctx.referenceVersion,
    source: ctx.referenceSource,
    envelopeSchemaVersion: GEO_ENVELOPE_SCHEMA_VERSION,
  };
  out.resolution = {
    rawInput: out.rawName,
    normalizedInput: resolutionHint?.normalizedInput ?? (out.rawName ? normalizeLocalityLookupKey(out.rawName) : null),
    geoEntityType: resolutionHint?.geoEntityType ?? 'unknown',
  };
  out.audit = {
    geoReferenceVersion: out.geoReferenceVersion,
    source: out.source ?? null,
    resolvedAt,
  };
  if (candidates?.length) out.candidates = candidates;
  return assertValidGeo(out);
}

/**
 * @param {{
 *   northReferencePort: import('../domain/ports/IGeoNorthReferencePort.js').IGeoNorthReferencePort,
 *   overridesPort?: { lookupOverride?: (rawInput: string, normalizedInput: string) => ({ canonicalKey: string, geoEntityType?: string } | null) } | null,
 * }} deps
 */
export function createGeoService({ northReferencePort, overridesPort = null }) {
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
  const fuzzyPrefixBuckets = buildFuzzyPrefixBuckets(localities);
  const byCanonicalKey = new Map(localities.map((r) => [r.canonicalKey, r]));
  const distanceBandPolicy = loadDistanceBandPolicy();
  const legacySub = String(process.env.GEO_LEGACY_SUBREGION_ID ?? '0').trim().toLowerCase();
  const emitLegacySubregionId = legacySub === '1' || legacySub === 'true';
  const geoCtx = { referenceVersion, referenceSource };
  const unknown = (reason, rawName, candidates, resolutionHint) =>
    buildUnknownGeo(geoCtx, reason, rawName, candidates, resolutionHint);

  return {
    distanceBandForKm,

    /**
     * @param {string|null|undefined} rawName
     * @param {{
     *   sourceType?: string,
     *   reporterSubregionHint?: string,
     *   provenance?: string,
     *   resolutionScope?: 'signal' | 'message',
     * }} [options]
     * @returns {import('../domain/value_objects/geoEnrichment.js').GeoResolved | import('../domain/value_objects/geoEnrichment.js').GeoUnknown}
     */
    resolveLocalityName(rawName, options = {}) {
      const preferSubregionId = String(options.reporterSubregionHint ?? '').trim().toLowerCase() || undefined;
      const provenance = String(options.provenance ?? GEO_PROVENANCE.direct).trim();
      const resolutionScope = options.resolutionScope;
      const sourceType = options.sourceType;
      const trimmed = String(rawName ?? '').trim();
      if (!trimmed) {
        return unknown('NO_LOCALITY', null, undefined, { geoEntityType: 'unknown', normalizedInput: null });
      }

      const exact = resolveByExactStages(index, trimmed);
      /** @type {{ row: import('../domain/value_objects/geoEnrichment.js').NorthLocalityRow, matchMethod: string, matchConfidence: number, overrideGeoEntityType?: string } | null} */
      let hit = exact;
      /** @type {number | undefined} */
      let fuzzyCandidateCount;
      /** @type {Array<{ canonicalKey: string, score: number }> | undefined} */
      let fuzzyTopCandidates;
      if (!hit) {
        // Deterministic manual override (operator-approved alias) before fuzzy.
        const normalizedInput = normalizeLocalityLookupKey(trimmed);
        const ov = overridesPort?.lookupOverride?.(trimmed, normalizedInput) ?? null;
        if (ov && typeof ov.canonicalKey === 'string' && ov.canonicalKey.trim() && byCanonicalKey.has(ov.canonicalKey.trim())) {
          const row = byCanonicalKey.get(ov.canonicalKey.trim());
          hit = {
            row,
            matchMethod: 'manual_override',
            matchConfidence: 1,
            overrideGeoEntityType: ov.geoEntityType,
          };
        }
      }
      if (!hit) {
        const fuzzy = resolveByFuzzyBest(localities, trimmed, {
          preferSubregionId,
          prefixBuckets: fuzzyPrefixBuckets,
        });
        if ('row' in fuzzy) {
          fuzzyCandidateCount = fuzzy.candidateCount;
          fuzzyTopCandidates = fuzzy.topCandidates;
          hit = { row: fuzzy.row, matchMethod: fuzzy.matchMethod, matchConfidence: fuzzy.matchConfidence };
        } else if (fuzzy.candidates?.length) {
          const hinted = preferSubregionId
            ? pickCandidateInSubregion(fuzzy.candidates, byCanonicalKey, preferSubregionId)
            : null;
          if (hinted) {
            const top = fuzzy.candidates.find((c) => c.canonicalKey === hinted.canonicalKey);
            hit = {
              row: hinted,
              matchMethod: 'fuzzy',
              matchConfidence: top?.score ?? FUZZY_METRICS_MIN_CONFIDENCE,
            };
            fuzzyCandidateCount = fuzzy.candidates.length;
            fuzzyTopCandidates = fuzzy.candidates;
          } else {
            return unknown('NO_CONFIDENT_MATCH', trimmed, fuzzy.candidates, {
              geoEntityType: 'unknown',
              normalizedInput: normalizeLocalityLookupKey(trimmed),
            });
          }
        }
      }

      if (!hit) {
        const nonLoc = classifyNonLocalityTerm(trimmed);
        if (nonLoc) {
          return unknown(nonLoc.reason, trimmed, undefined, {
            geoEntityType: nonLoc.geoEntityType,
            normalizedInput: normalizeLocalityLookupKey(trimmed),
          });
        }
        return unknown('NO_MATCH', trimmed, undefined, {
          geoEntityType: 'unknown',
          normalizedInput: normalizeLocalityLookupKey(trimmed),
        });
      }

      const row = hit.row;
      const distanceKmToNorthBorder = distanceKmToPolyline(row.lat, row.lon, border);
      const pboSubregionId = row.subregionId;

      const matchMethod =
        hit.matchMethod === 'exact' ||
        hit.matchMethod === 'punctuation' ||
        hit.matchMethod === 'hebrew_final' ||
        hit.matchMethod === 'manual_override' ||
        hit.matchMethod === 'fuzzy'
          ? hit.matchMethod
          : 'exact';
      const matchConfidence = hit.matchConfidence;

      // Stricter fuzzy: below metrics threshold, do not auto-resolve; emit candidates instead.
      if (matchMethod === 'fuzzy' && Number.isFinite(matchConfidence) && matchConfidence < FUZZY_METRICS_MIN_CONFIDENCE) {
        return unknown('NO_CONFIDENT_MATCH', trimmed, fuzzyTopCandidates ?? undefined, {
          geoEntityType: 'unknown',
          normalizedInput: normalizeLocalityLookupKey(trimmed),
        });
      }

      const fromReference = resolveReferenceGeoEntityType(row);
      const geoEntityType = coalesceGeoEntityTypeHint(hit.overrideGeoEntityType, fromReference);
      const distanceSemantics = distanceSemanticsForGeoEntityType(geoEntityType);

      const { quality, usableForMetrics, requiresReview, policyReasons } = deriveGeoQualityFields({
        matchMethod,
        matchConfidence,
        geoEntityType,
        provenance,
        sourceType,
      });
      const scopeConfidence = deriveScopeConfidence({ usableForMetrics, requiresReview });
      const matchedVariant = pickMatchedDisplayName(row, trimmed);
      const candidateCount =
        matchMethod === 'fuzzy' && Number.isFinite(fuzzyCandidateCount) ? fuzzyCandidateCount : 1;
      const resolvedAt = new Date().toISOString();
      const decisionReasons = [...policyReasons];
      if (matchMethod === 'manual_override') {
        decisionReasons.length = 0;
        decisionReasons.push('manual_override');
      }

      /** @type {import('../domain/value_objects/geoEnrichment.js').GeoResolved} */
      const band = distanceBandForKm(distanceKmToNorthBorder, distanceBandPolicy);

      /** @type {import('../domain/value_objects/geoEnrichment.js').GeoResolution} */
      const resolution = {
        rawInput: trimmed,
        normalizedInput: normalizeLocalityLookupKey(trimmed),
        canonicalKey: row.canonicalKey,
        matchedName: matchedVariant,
        matchedVariant,
        matchMethod,
        matchConfidence,
        candidateCount,
        geoEntityType,
        provenance,
      };
      if (resolutionScope === 'signal' || resolutionScope === 'message') {
        resolution.scope = resolutionScope;
      }

      const resolved = {
        kind: 'resolved',
        envelopeSchemaVersion: GEO_ENVELOPE_SCHEMA_VERSION,
        geoEntityType,
        resolution,
        classification: {
          pboSubregionId,
          geoAreaTags: geoAreaTagsForPboSubregion(pboSubregionId),
          isGolan: isGolanSubregionId(pboSubregionId),
          distanceKmToNorthBorder,
          distanceBand: band,
          distanceSemantics,
          distancePolicyVersion: distanceBandPolicy.version,
        },
        policy: {
          geoPolicyVersion: GEO_POLICY_VERSION,
          quality,
          usableForMetrics,
          requiresReview,
          scopeConfidence,
          decisionReasons,
        },
        audit: {
          geoReferenceVersion: referenceVersion,
          borderReferenceVersion: borderVersion,
          source: referenceSource,
          resolvedAt,
        },
        matchEvidence: {
          rawInput: trimmed,
          normalizedInput: normalizeLocalityLookupKey(trimmed),
          matchedVariant,
          candidateCount,
        },
      };
      if (emitLegacySubregionId) {
        resolved.subregionId = pboSubregionId;
      }
      resolved.scopeDecision = buildGeoScopeDecision(resolved);
      return assertValidGeo(resolved);
    },
  };
}
