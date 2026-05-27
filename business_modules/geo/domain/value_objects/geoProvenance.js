/** How the locality candidate was derived before geoService resolve. */
export const GEO_PROVENANCE = Object.freeze({
  structured: 'structured',
  text_inferred: 'text_inferred',
  message_level: 'message_level',
  direct: 'direct',
});

/** @type {ReadonlySet<string>} */
export const GEO_PROVENANCE_VALUES = new Set(Object.values(GEO_PROVENANCE));

/** Source types where text-inferred locality must not drive metrics. */
export const TEXT_INFERENCE_SOURCE_TYPES = new Set(['news', 'radio', 'social']);

/**
 * @param {unknown} value
 * @returns {value is keyof typeof GEO_PROVENANCE}
 */
export function isGeoProvenance(value) {
  return typeof value === 'string' && GEO_PROVENANCE_VALUES.has(value);
}
