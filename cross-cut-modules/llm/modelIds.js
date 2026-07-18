/**
 * Canonical Claude model ids. Import these instead of hardcoding model strings;
 * per-call env overrides (process.env.X ?? HAIKU_MODEL) stay at the call sites.
 * llmPricing.js intentionally keys on literal ids and does not import from here.
 */
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
export const SONNET_MODEL = 'claude-sonnet-4-6';
