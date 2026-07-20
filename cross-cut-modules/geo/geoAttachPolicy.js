/** All resilience pipeline source types that receive geo envelopes via geoService. */
export const RESILIENCE_GEO_SOURCE_TYPES = Object.freeze([
  'news',
  'radio',
  'social',
  'whatsapp',
  'field',
  'visits',
  'pbo',
  'pbo_regional',
  'naftali',
]);

export function shouldAttachGeoToSignal(signal) {
  if (!signal || typeof signal !== 'object') return false;
  if ('geo' in signal && signal.geo != null) return false;
  const st = signal.source_type;
  return st == null || RESILIENCE_GEO_SOURCE_TYPES.includes(st);
}
