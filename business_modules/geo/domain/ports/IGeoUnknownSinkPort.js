/**
 * Optional sink for unknown locality resolutions (review backlog).
 */
export class IGeoUnknownSinkPort {
  constructor() {
    if (new.target === IGeoUnknownSinkPort) {
      throw new Error('IGeoUnknownSinkPort is abstract');
    }
  }

  /**
   * @param {import('../value_objects/geoEnrichment.js').GeoUnknown} envelope
   */
  recordUnknown(_envelope) {
    throw new Error('recordUnknown() must be implemented');
  }
}
