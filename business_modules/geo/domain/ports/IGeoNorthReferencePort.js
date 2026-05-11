/**
 * Loads versioned north reference data (locality table + border polyline) for deterministic geo enrichment.
 */
export class IGeoNorthReferencePort {
  constructor() {
    if (new.target === IGeoNorthReferencePort) {
      throw new Error('IGeoNorthReferencePort is abstract');
    }
  }

  /**
   * @returns {{
   *   referenceVersion: string,
   *   referenceSource: string,
   *   borderVersion: string | null,
   *   localities: Array<{
   *     canonicalKey: string,
   *     names: string[],
   *     lat: number,
   *     lon: number,
   *     subregionId: string,
   *     officialHebrewName?: string,
   *     municipalityType?: string,
   *     parentCouncilKey?: string | null,
   *   }>,
   *   border: Array<{ lat: number, lon: number }>,
   * }}
   */
  loadNorthGeoReference() {
    throw new Error('loadNorthGeoReference() must be implemented');
  }
}
