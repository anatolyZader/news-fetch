/**
 * Load signal bundles for assess-signals (closed JSON or mapped observations).
 */
export class ISignalBundlePort {
  constructor() {
    if (new.target === ISignalBundlePort) {
      throw new Error('ISignalBundlePort is abstract');
    }
  }

  /**
   * Discover bundles in the assessment window.
   * @param {{ targetDate: string, days: number, enabledSources?: Set<string>|null }} _opts
   * @returns {object} discovery context for loadBundles
   */
  discoverBundles(_opts) {
    throw new Error('not implemented');
  }

  /**
   * @param {object} discovery from discoverBundles
   * @param {{ targetDate: string, enabledSources?: Set<string>|null }} _opts
   * @returns {Array<{ file: string, sourceType: string, fileDate: string, fileDistrictId: string|null, weight: number, data: object }>}
   */
  loadBundles(_discovery, _opts) {
    throw new Error('not implemented');
  }

  /**
   * @param {object} discovery
   * @returns {boolean}
   */
  hasAnySource(_discovery) {
    throw new Error('not implemented');
  }
}
