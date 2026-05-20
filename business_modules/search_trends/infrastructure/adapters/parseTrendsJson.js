/**
 * @param {unknown} raw
 * @param {string} label
 */
export function parseTrendsJson(raw, label) {
  if (!raw || typeof raw !== 'string') {
    throw new Error(`${label}: empty response`);
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) {
    throw new Error(
      `${label}: Google returned HTML (common on cloud server IPs — set DATAFORSEO_LOGIN/PASSWORD for live data)`,
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${label}: invalid JSON`);
  }
}
