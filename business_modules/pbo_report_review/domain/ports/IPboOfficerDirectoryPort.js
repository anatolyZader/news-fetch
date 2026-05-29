/**
 * Port: resolve PBO officer email + language per municipality.
 */
export class IPboOfficerDirectoryPort {
  constructor() {
    if (new.target === IPboOfficerDirectoryPort) {
      throw new Error('IPboOfficerDirectoryPort is abstract');
    }
  }

  /**
   * @param {string} municipalityName
   * @returns {{ email: string, language: string } | null}
   */
  lookup(_municipalityName) {
    throw new Error('not implemented');
  }
}
