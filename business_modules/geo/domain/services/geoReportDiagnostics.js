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
    const refVer = g.audit?.geoReferenceVersion ?? g.geoReferenceVersion;
    const borderVer = g.audit?.borderReferenceVersion ?? g.borderReferenceVersion;
    if (typeof refVer === 'string' && refVer.trim()) {
      refs.add(refVer.trim());
    }
    if (typeof borderVer === 'string' && borderVer.trim()) {
      borders.add(borderVer.trim());
    }
  }
  return {
    geo_reference_versions_used: [...refs].sort((a, b) => a.localeCompare(b)),
    border_reference_versions_used: [...borders].sort((a, b) => a.localeCompare(b)),
  };
}
