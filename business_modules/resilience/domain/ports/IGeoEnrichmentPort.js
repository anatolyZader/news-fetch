/**
 * Port for deterministic locality → geo envelope resolution.
 * Implemented in composition (e.g. GeoEnrichmentAdapter) backed by `business_modules/geo`.
 */
export class IGeoEnrichmentPort {
  constructor() {
    if (new.target === IGeoEnrichmentPort) {
      throw new Error('IGeoEnrichmentPort is abstract');
    }
  }

  /**
   * @param {string|null|undefined} rawName
   * @returns {object} GeoResolved | GeoUnknown envelope (see business_modules/geo domain value objects)
   */
  resolveLocalityName(rawName) {
    throw new Error('resolveLocalityName() must be implemented');
  }
}
