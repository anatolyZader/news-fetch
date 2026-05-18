/**
 * Bucket distance to northern border for reporting (km).
 * @param {number} km
 * @param {{ version: string, bands: { id: string, maxKm: number | null }[] }} [policy]
 * @returns {string}
 */
export function distanceBandForKm(km, policy) {
  if (!Number.isFinite(km) || km < 0) return 'unknown';
  const bands = policy?.bands ?? [
    { id: '0-10', maxKm: 10 },
    { id: '10-25', maxKm: 25 },
    { id: '25+', maxKm: null },
  ];
  for (const b of bands) {
    if (b.maxKm == null) return b.id;
    if (km < b.maxKm) return b.id;
  }
  return bands[bands.length - 1]?.id ?? 'unknown';
}
