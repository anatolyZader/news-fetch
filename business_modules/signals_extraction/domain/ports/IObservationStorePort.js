/**
 * Persist and load observation bundles on disk.
 */
export class IObservationStorePort {
  constructor() {
    if (new.target === IObservationStorePort) {
      throw new Error('IObservationStorePort is abstract');
    }
  }

  /**
   * @param {object} bundle
   * @returns {string} written path
   */
  writeBundle(_bundle) {
    throw new Error('not implemented');
  }

  /**
   * @param {{ profile?: string, date?: string, maxDays?: number }} [opts]
   * @returns {Array<object>}
   */
  listBundles(_opts) {
    throw new Error('not implemented');
  }

  /**
   * @param {string} filename
   * @returns {object|null}
   */
  loadBundle(_filename) {
    throw new Error('not implemented');
  }
}
