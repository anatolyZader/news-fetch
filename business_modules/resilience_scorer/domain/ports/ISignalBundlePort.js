/**
 * Discovers and loads per-source signal bundles for the assess-signals pipeline.
 *
 * Pipeline position: pre-SCORE assess stage — invoked by assessSignalsDeps and
 * createSignalBundlePort before scope partition and evidence prep.
 *
 * Owns: contract surface (abstract class and method signatures below).
 * Does NOT: implement adapters (those live in infrastructure/).
 *
 * Key collaborators: ClosedSignalBundleFsAdapter, MappedObservationBundleAdapter,
 * createSignalBundlePort, assessSignalsCli, domain/services/paths/signalBundles.js.
 */

/**
 * Abstract port for closed-catalogue JSON bundles and mapped observation bundles.
 *
 * Implementations discover files in the assessment window, load parsed signal data,
 * and expose source-type metadata for downstream weighting and scope filtering.
 */
export class ISignalBundlePort {
  constructor() {
    if (new.target === ISignalBundlePort) {
      throw new Error('ISignalBundlePort is abstract');
    }
  }

  /**
   * Scan the assessment window and build a discovery context for subsequent loads.
   *
   * @param {{ targetDate: string, days: number, enabledSources?: Set<string>|null }} _opts
   * `targetDate` — end of window; `days` — lookback; `enabledSources` — optional
   * filter limiting which ingest source types are considered.
   * @returns {object} Opaque discovery context passed to loadBundles and hasAnySource.
   */
  discoverBundles(_opts) {
    throw new Error('not implemented');
  }

  /**
   * Load parsed signal bundles from a prior discoverBundles result.
   *
   * @param {object} discovery Context returned by discoverBundles.
   * @param {{ targetDate: string, enabledSources?: Set<string>|null }} _opts
   * Target date and optional source filter applied during load.
   * @returns {Array<{ file: string, sourceType: string, fileDate: string, fileDistrictId: string|null, weight: number, data: object }>}
   * Normalized bundle records with file path, source metadata, district id, weight,
   * and parsed JSON payload ready for signal flattening.
   */
  loadBundles(_discovery, _opts) {
    throw new Error('not implemented');
  }

  /**
   * Whether discovery found at least one enabled source with bundle artifacts.
   *
   * @param {object} discovery Context returned by discoverBundles.
   * @returns {boolean} True when assess can proceed with at least one source present.
   */
  hasAnySource(_discovery) {
    throw new Error('not implemented');
  }
}
