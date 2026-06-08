/**
 * Extraction cache env helpers (no business-module imports).
 */

export function getMultipassMode(env = process.env) {
  const v = env.RESILIENCE_EXTRACT_MULTIPASS;
  if (v === '0' || v === 'false' || v === 'off') return '0';
  if (v === '2') return '2';
  return '1';
}
