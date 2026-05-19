import { validateGeoEnvelope } from '../../business_modules/geo/domain/value_objects/geoEnrichmentSchema.js';
import { inferLocalityCandidateForSignal } from './localityCandidate.js';

/**
 * @param {object} geo
 * @param {'message' | 'signal'} scope
 * @returns {object}
 */
function stampResolutionScope(geo, scope) {
  if (!geo || geo.kind !== 'resolved' || typeof geo !== 'object') return geo;

  const existing = geo.resolution;
  if (existing != null && typeof existing === 'object' && typeof existing.rawInput === 'string') {
    return { ...geo, resolution: { ...existing, scope } };
  }

  const me = geo.matchEvidence;
  if (
    me != null &&
    typeof me === 'object' &&
    typeof geo.canonicalKey === 'string' &&
    geo.matchMethod
  ) {
    return {
      ...geo,
      resolution: {
        rawInput: me.rawInput,
        normalizedInput: me.normalizedInput,
        canonicalKey: geo.canonicalKey,
        matchedName: geo.matchedName ?? me.matchedVariant,
        matchedVariant: me.matchedVariant,
        matchMethod: geo.matchMethod,
        matchConfidence: geo.matchConfidence,
        candidateCount: me.candidateCount,
        geoEntityType: geo.geoEntityType,
        scope,
      },
    };
  }

  return geo;
}

/**
 * @param {Array<object>} signals
 * @param {{ resolveLocalityName: (raw: string|null|undefined, options?: object) => object }} geoEnrichmentPort
 * @param {{
 *   sourceType?: string,
 *   reporterSubregionHint?: string,
 *   messageLocality?: string|null,
 *   nameIndex?: { entries: { normalized: string, display: string }[] },
 * }} [opts]
 * @returns {{ signals: object[], attached: number, resolved: number, unknown: number }}
 */
export function attachGeoToSignals(signals, geoEnrichmentPort, opts = {}) {
  const list = Array.isArray(signals) ? signals : [];
  let attached = 0;
  let resolved = 0;
  let unknown = 0;

  const resolveOpts = {
    sourceType: opts.sourceType,
    reporterSubregionHint: opts.reporterSubregionHint,
  };

  const out = list.map((s) => {
    if (!s || typeof s !== 'object' || ('geo' in s && s.geo != null)) {
      return s;
    }

    let candidate = null;
    let scope = 'signal';

    const inferred = inferLocalityCandidateForSignal(s, { nameIndex: opts.nameIndex });
    if (inferred.candidate) {
      candidate = inferred.candidate;
      scope = inferred.scope;
    } else if (opts.messageLocality) {
      candidate = opts.messageLocality;
      scope = 'message';
    }

    const geoRaw = geoEnrichmentPort.resolveLocalityName(candidate, resolveOpts);
    const geo = stampResolutionScope(geoRaw, scope);

    if (process.env.GEO_ASSERT_ENVELOPE === '1') {
      const v = validateGeoEnvelope(geo);
      if (!v.ok) {
        throw new Error(`Invalid geo envelope after resolve: ${v.errors.join('; ')}`);
      }
    }

    attached++;
    if (geo?.kind === 'resolved') resolved++;
    else unknown++;

    return { ...s, geo };
  });

  return { signals: out, attached, resolved, unknown };
}

/**
 * @param {Array<object>} signals
 * @param {object} structured
 * @param {{ resolveLocalityName: (raw: string|null|undefined, options?: object) => object }} geoEnrichmentPort
 * @param {{ sourceType?: string, reporterSubregionHint?: string, nameIndex?: object }} [opts]
 */
export function attachGeoToSignalsAndStructured(signals, structured, geoEnrichmentPort, opts = {}) {
  const messageLocality =
    structured?.observation?.locality != null
      ? String(structured.observation.locality).trim() || null
      : null;

  const { signals: withGeo } = attachGeoToSignals(signals, geoEnrichmentPort, {
    ...opts,
    messageLocality,
  });

  const obsGeo =
    withGeo.find((s) => s?.geo)?.geo ??
    geoEnrichmentPort.resolveLocalityName(messageLocality, {
      sourceType: opts.sourceType,
      reporterSubregionHint: opts.reporterSubregionHint,
    });

  const observation = {
    ...structured.observation,
    geo: stampResolutionScope(obsGeo, messageLocality ? 'message' : 'signal'),
  };

  return {
    signals: withGeo,
    structured: { ...structured, observation },
  };
}
