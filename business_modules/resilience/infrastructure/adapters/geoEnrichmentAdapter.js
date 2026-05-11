import { IGeoEnrichmentPort } from '../../domain/ports/IGeoEnrichmentPort.js';

/**
 * Bridges resilience `IGeoEnrichmentPort` to `createGeoService` (wired only from app/scripts).
 */
export class GeoEnrichmentAdapter extends IGeoEnrichmentPort {
  /** @param {{ geoService: object, unknownSink?: { recordUnknown: (e: object) => void } | null }} deps */
  constructor({ geoService, unknownSink = null }) {
    super();
    this._geoService = geoService;
    this._unknownSink = unknownSink;
  }

  resolveLocalityName(rawName) {
    const r = this._geoService.resolveLocalityName(rawName);
    if (
      this._unknownSink &&
      r?.kind === 'unknown' &&
      (r.reason === 'NO_MATCH' || r.reason === 'NO_CONFIDENT_MATCH')
    ) {
      this._unknownSink.recordUnknown(r);
    }
    return r;
  }
}

/**
 * @param {{ geoService: object, unknownSink?: { recordUnknown: (e: object) => void } | null }} deps
 */
export function createGeoEnrichmentAdapter(deps) {
  return new GeoEnrichmentAdapter(deps);
}

/** Duck-typed no-op for tests or offline mode (no geo dependency). */
export class NoOpGeoEnrichmentPort extends IGeoEnrichmentPort {
  resolveLocalityName() {
    return {
      kind: 'unknown',
      reason: 'GEO_DISABLED',
      rawName: null,
      geoReferenceVersion: null,
    };
  }
}

export function createNoOpGeoEnrichmentPort() {
  return new NoOpGeoEnrichmentPort();
}
