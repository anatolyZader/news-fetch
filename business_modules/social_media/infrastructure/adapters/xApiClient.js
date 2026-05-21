/**
 * Minimal X API v2 client for /x-3 counts/recent and search/recent.
 *
 * @param {{ bearerToken: string, fetchFn?: typeof fetch }} deps
 */
export function createXApiClient({ bearerToken, fetchFn = globalThis.fetch }) {
  if (!bearerToken) throw new Error('X_BEARER_TOKEN is not configured');

  async function request(url) {
    const res = await fetchFn(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = body?.errors?.[0]?.message ?? body?.title ?? res.statusText;
      throw new Error(`X API ${res.status}: ${detail}`);
    }
    return body;
  }

  return {
    async countsRecent({ query, startTime, endTime }) {
      const params = new URLSearchParams({
        query,
        start_time: startTime,
        end_time: endTime,
        granularity: 'day',
      });
      return request(`https://api.x.com/2/tweets/counts/recent?${params.toString()}`);
    },

    async searchRecent({ query, startTime, endTime, maxResults }) {
      const params = new URLSearchParams({
        query,
        start_time: startTime,
        end_time: endTime,
        max_results: String(Math.min(Math.max(maxResults, 10), 100)),
        'tweet.fields': 'created_at,author_id,conversation_id,public_metrics,lang,geo',
        'user.fields': 'description,name,username,location,verified,verified_type,public_metrics',
        expansions: 'author_id',
      });
      return request(`https://api.x.com/2/tweets/search/recent?${params.toString()}`);
    },
  };
}
