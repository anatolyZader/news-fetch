/**
 * URL reputation checks via the Google Safe Browsing Lookup API v4.
 * security:trusted-vendor-fetch — POSTs candidate URLs to Google's fixed endpoint only.
 *
 * Fail-open by design: a missing key or API failure yields 'unchecked', never a throw —
 * reputation is an extra safety layer, not an availability dependency.
 */

const SAFE_BROWSING_ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const MAX_ENTRIES_PER_REQUEST = 500;
const THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
];

export function safeBrowsingApiKey(env = process.env) {
  return String(env.SAFE_BROWSING_API_KEY ?? '').trim();
}

/**
 * @typedef {{ status: 'ok' | 'flagged' | 'unchecked', threatType?: string }} UrlReputationResult
 */

/**
 * @param {object} [opts]
 * @param {string} [opts.apiKey] defaults to SAFE_BROWSING_API_KEY
 * @param {typeof fetch} [opts.fetchImpl] injectable for tests
 * @param {(msg: string) => void} [opts.warn]
 * @returns {{ enabled: boolean, checkUrls: (urls: string[]) => Promise<Map<string, UrlReputationResult>> }}
 */
export function createUrlReputationChecker(opts = {}) {
  const apiKey = opts.apiKey ?? safeBrowsingApiKey();
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const warn = opts.warn ?? console.warn;
  const enabled = apiKey.length > 0;
  let warnedDisabled = false;

  async function checkChunk(urls) {
    const results = new Map();
    try {
      const response = await fetchImpl(
        `${SAFE_BROWSING_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client: { clientId: 'news-resilience', clientVersion: '1.0.0' },
            threatInfo: {
              threatTypes: THREAT_TYPES,
              platformTypes: ['ANY_PLATFORM'],
              threatEntryTypes: ['URL'],
              threatEntries: urls.map((url) => ({ url })),
            },
          }),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      for (const url of urls) results.set(url, { status: 'ok' });
      for (const match of payload?.matches ?? []) {
        const url = match?.threat?.url;
        if (url) results.set(url, { status: 'flagged', threatType: match.threatType ?? 'UNKNOWN' });
      }
    } catch (err) {
      warn(`Safe Browsing lookup failed (fail-open, urls unchecked): ${err?.message ?? err}`);
      for (const url of urls) results.set(url, { status: 'unchecked' });
    }
    return results;
  }

  async function checkUrls(urls) {
    const unique = [...new Set((urls ?? []).filter((u) => typeof u === 'string' && u.length > 0))];
    const results = new Map();
    if (!enabled) {
      if (!warnedDisabled) {
        warnedDisabled = true;
        warn('SAFE_BROWSING_API_KEY not set — URL reputation checks disabled');
      }
      for (const url of unique) results.set(url, { status: 'unchecked' });
      return results;
    }
    for (let i = 0; i < unique.length; i += MAX_ENTRIES_PER_REQUEST) {
      const chunk = unique.slice(i, i + MAX_ENTRIES_PER_REQUEST);
      for (const [url, result] of await checkChunk(chunk)) results.set(url, result);
    }
    return results;
  }

  return { enabled, checkUrls };
}
