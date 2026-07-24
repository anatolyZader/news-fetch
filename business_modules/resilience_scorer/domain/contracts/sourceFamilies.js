/**
 * Source-type family taxonomy — the single home for signal source groupings.
 *
 * Pipeline position: contract consumed across extract/assess policies. Every
 * policy that asks "is this a field-family / north-default / WhatsApp source?"
 * derives its set from here instead of keeping a private list. Client-safe
 * isomorphic (pure constants).
 *
 * Owns: the family sets below. `field` is read-compat for older bundles that
 * predate the `field` → `visits` rename (see visitsSourceType.js for the
 * normalization helpers).
 *
 * Does NOT: normalize source keys (signals/visitsSourceType.js), assign
 * districts (signals/signalDistrictId.js), or apply gaming caps.
 *
 * Key collaborators: signals/visitsSourceType.js, signals/fieldSignalPolicy.js,
 * signals/signalDistrictId.js, signals/signalGamingPolicy.js.
 */

/** Structured field-anchor feeds excluding WhatsApp channels. */
export const FIELD_ANCHOR_SOURCE_TYPES = Object.freeze([
  'visits',
  'field', // read-compat for older bundles
  'pbo',
  'pbo_regional',
  'naftali',
]);

/** Visits-module family: officer visit reports in all their spellings. */
export const VISITS_SOURCE_TYPES = Object.freeze([
  'visits',
  'field', // read-compat for older bundles
  'field_whatsapp',
]);

/** Full field family: structured field anchors plus field WhatsApp channel. */
export const FIELD_FAMILY_SOURCE_TYPES = Object.freeze([
  ...FIELD_ANCHOR_SOURCE_TYPES,
  'field_whatsapp',
]);

/**
 * North-only structured feeds: when district_id is absent on a signal from
 * these sources, north is the correct default (signalDistrictId.js safety net).
 */
export const DEFAULT_NORTH_SOURCE_TYPES = Object.freeze([
  ...FIELD_FAMILY_SOURCE_TYPES,
  'whatsapp',
]);

/** WhatsApp-channel sources subject to per-sender gaming caps. */
export const WHATSAPP_SOURCE_TYPES = Object.freeze([
  'whatsapp',
  'field_whatsapp',
]);
