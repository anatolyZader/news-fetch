/**
 * Bucket distance to northern border for reporting (km).
 * @param {number} km
 * @returns {string}
 */
export function distanceBandForKm(km) {
  if (!Number.isFinite(km) || km < 0) return 'unknown';
  if (km < 10) return '0-10';
  if (km < 25) return '10-25';
  return '25+';
}
