import { haversineKm } from './haversineKm.js';

/**
 * Approximate km from point P to segment AB using a local planar metric (adequate for northern Israel scale).
 * @param {number} latP
 * @param {number} lonP
 * @param {number} latA
 * @param {number} lonA
 * @param {number} latB
 * @param {number} lonB
 * @returns {number}
 */
export function approximateKmPointToSegment(latP, lonP, latA, lonA, latB, lonB) {
  const cosLat = Math.cos((latP * Math.PI) / 180);
  const kmPerLat = 110.574;
  const kmPerLon = 111.32 * cosLat;

  const px = (lonP - lonA) * kmPerLon;
  const py = (latP - latA) * kmPerLat;
  const vx = (lonB - lonA) * kmPerLon;
  const vy = (latB - latA) * kmPerLat;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-12) {
    return haversineKm(latP, lonP, latA, lonA);
  }
  let t = (px * vx + py * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = t * vx;
  const qy = t * vy;
  const dx = px - qx;
  const dy = py - qy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Minimum km from point to a polyline (open chain; degrees WGS84).
 * @param {number} lat
 * @param {number} lon
 * @param {{ lat: number, lon: number }[]} polyline at least one point; one point = distance to that vertex
 * @returns {number}
 */
export function distanceKmToPolyline(lat, lon, polyline) {
  if (!polyline?.length) return Number.POSITIVE_INFINITY;
  if (polyline.length === 1) {
    return haversineKm(lat, lon, polyline[0].lat, polyline[0].lon);
  }
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const d = approximateKmPointToSegment(lat, lon, a.lat, a.lon, b.lat, b.lon);
    if (d < min) min = d;
  }
  return min;
}
