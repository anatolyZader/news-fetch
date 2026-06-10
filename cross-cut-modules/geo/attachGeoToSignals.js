import { validateGeoEnvelope, GEO_PROVENANCE } from '../../business_modules/geo/index.js';
import { inferLocalityCandidateForSignal } from './localityCandidate.js';

/**
 * @param {object} geo
 * @param {'message' | 'signal'} scope
 * @returns {object}
 */
function stampResolutionScope(geo, scope) {
  if (!geo || geo.kind !== 'resolved' || typeof geo !== 'object') return geo;
  const existing = geo.resolution;
  if (existing != null && typeof existing === 'object') {
    return { ...geo, resolution: { ...existing, scope } };
  }
  return { ...geo, resolution: { scope } };
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

  const out = list.map((s) => {
    if (!s || typeof s !== 'object') {
      return s;
    }
    if ('geo' in s && s.geo != null && s.geo?.kind !== 'unknown') {
      return s;
    }

    let candidate = null;
    let scope = 'signal';
    let provenance = GEO_PROVENANCE.direct;

    const inferred = inferLocalityCandidateForSignal(s, { nameIndex: opts.nameIndex });
    if (inferred.candidate) {
      candidate = inferred.candidate;
      scope = inferred.scope;
      provenance = inferred.provenance ?? GEO_PROVENANCE.text_inferred;
    } else if (opts.messageLocality) {
      candidate = opts.messageLocality;
      scope = 'message';
      provenance = GEO_PROVENANCE.message_level;
    }

    if (!candidate) {
      return s;
    }

    const geoRaw = geoEnrichmentPort.resolveLocalityName(candidate, {
      sourceType: opts.sourceType ?? s.source_type,
      reporterSubregionHint: opts.reporterSubregionHint,
      provenance,
      resolutionScope: scope,
    });
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
  const messageLocalityKey = structured?.observation?.localityKey;
  const messageLocality = structured?.observation?.locality == null
    ? null
    : String(structured.observation.locality).trim() || null;
  const geoInput = messageLocalityKey
    ? String(messageLocalityKey).replaceAll('_', ' ')
    : messageLocality;

  const { signals: withGeo } = attachGeoToSignals(signals, geoEnrichmentPort, {
    ...opts,
    messageLocality: geoInput,
  });

  const obsGeo = geoInput
    ? geoEnrichmentPort.resolveLocalityName(geoInput, {
        sourceType: opts.sourceType,
        reporterSubregionHint: opts.reporterSubregionHint,
        provenance: messageLocalityKey ? GEO_PROVENANCE.structured : GEO_PROVENANCE.message_level,
        resolutionScope: 'message',
      })
    : withGeo.find((s) => s?.geo)?.geo ?? null;

  const observation = {
    ...structured.observation,
    ...(obsGeo?.kind === 'resolved' && obsGeo.resolution?.canonicalKey
      ? { localityKey: obsGeo.resolution.canonicalKey }
      : {}),
    ...(obsGeo ? { geo: stampResolutionScope(obsGeo, geoInput ? 'message' : 'signal') } : {}),
  };

  return {
    signals: withGeo,
    structured: { ...structured, observation },
  };
}
