/**
 * Optional port for deterministic locality override/alias resolution.
 * Implementations should be durable (e.g. SQLite) and wired from composition only.
 */
export class IGeoLocalityOverridesPort {
  constructor() {
    if (new.target === IGeoLocalityOverridesPort) {
      throw new Error('IGeoLocalityOverridesPort is abstract');
    }
  }

  /**
   * Lookup a pre-approved override for a raw input variant.
   *
   * @param {string} rawInput Original input string (trimmed).
   * @param {string} normalizedInput Normalized lookup key (NFKC/lower/space collapse).
   * @returns {{ canonicalKey: string, geoEntityType?: string } | null}
   */
  lookupOverride(_rawInput, _normalizedInput) {
    throw new Error('lookupOverride() must be implemented');
  }
}

