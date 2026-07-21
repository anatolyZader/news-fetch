/**
 * Resolves raw locality names to deterministic geo envelopes for signal enrichment.
 *
 * Pipeline position: post-EXTRACT enrichment — attachGeoToSignals and field-report
 * hygiene call this before scope partition and evidence prep.
 *
 * Owns: contract surface (abstract class and method signature below).
 * Does NOT: implement adapters (those live in infrastructure/ and business_modules/geo).
 *
 * Key collaborators: GeoEnrichmentAdapter, NoOpGeoEnrichmentPort, wireApplication,
 * whatsappResilienceAnalyzer, attachGeoToSignals, assessSignalsGeoScope tests.
 */

/**
 * Abstract port bridging resilience signal enrichment to the geo module.
 *
 * Implementations map free-text locality strings to GeoResolved or GeoUnknown
 * envelopes without embedding geo persistence or lookup logic in domain services.
 */
export class IGeoEnrichmentPort {
  constructor() {
    if (new.target === IGeoEnrichmentPort) {
      throw new Error('IGeoEnrichmentPort is abstract');
    }
  }

  /**
   * Resolve a raw locality name to a geo envelope for signal attachment.
   *
   * @param {string|null|undefined} _rawName Free-text place name from extraction or field report.
   * @param {{ sourceType?: string, reporterSubregionHint?: string }} [_options]
   * Optional source type and reporter subregion hint to disambiguate homonyms.
   * @returns {object} GeoResolved or GeoUnknown envelope (see business_modules/geo value objects).
   */
  resolveLocalityName(_rawName, _options) {
    throw new Error('resolveLocalityName() must be implemented');
  }
}
