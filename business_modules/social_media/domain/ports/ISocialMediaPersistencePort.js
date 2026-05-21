/**
 * Persistence for OSINT citizen-voice bundles and analysis reports under module data/.
 */
export class ISocialMediaPersistencePort {
  /**
   * @returns {string}
   */
  dataDir() {
    throw new Error('ISocialMediaPersistencePort.dataDir not implemented');
  }

  /**
   * @param {string} date YYYY-MM-DD
   * @returns {Promise<object|null>}
   */
  async loadBundle(_date) {
    throw new Error('ISocialMediaPersistencePort.loadBundle not implemented');
  }

  /**
   * @param {string} date YYYY-MM-DD
   * @param {object} bundle
   * @returns {Promise<{ path: string }>}
   */
  async saveBundle(_date, _bundle) {
    throw new Error('ISocialMediaPersistencePort.saveBundle not implemented');
  }

  /**
   * @param {string} date YYYY-MM-DD
   * @param {object} bundle
   * @returns {Promise<{ path: string }>}
   */
  async saveReport(_date, _bundle) {
    throw new Error('ISocialMediaPersistencePort.saveReport not implemented');
  }

  /**
   * @param {string} date YYYY-MM-DD
   * @returns {string}
   */
  bundlePath(_date) {
    throw new Error('ISocialMediaPersistencePort.bundlePath not implemented');
  }

  /**
   * @param {string} date YYYY-MM-DD
   * @returns {string}
   */
  reportPath(_date) {
    throw new Error('ISocialMediaPersistencePort.reportPath not implemented');
  }

  /**
   * @returns {string[]}
   */
  listBundleFilenames() {
    throw new Error('ISocialMediaPersistencePort.listBundleFilenames not implemented');
  }
}
