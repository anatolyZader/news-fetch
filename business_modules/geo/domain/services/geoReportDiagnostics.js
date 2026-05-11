/**
 * Collect unique reference/border versions from signal payloads for report audit metadata.
 * @param {Array<{ geo?: object }>} signals
 * @returns {{ geo_reference_versions_used: string[], border_reference_versions_used: string[] }}
 */
export function collectGeoVersionsFromSignals(signals) {
  const refs = new Set();
  const borders = new Set();
  for (const s of signals ?? []) {
    const g = s?.geo;
    if (!g || g.kind !== 'resolved') continue;
    if (typeof g.geoReferenceVersion === 'string' && g.geoReferenceVersion.trim()) {
      refs.add(g.geoReferenceVersion.trim());
    }
    if (typeof g.borderReferenceVersion === 'string' && g.borderReferenceVersion.trim()) {
      borders.add(g.borderReferenceVersion.trim());
    }
  }
  return {
    geo_reference_versions_used: [...refs].sort(),
    border_reference_versions_used: [...borders].sort(),
  };
}
