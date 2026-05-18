/**
 * Google Trends via SerpAPI (works from datacenter IPs when SERPAPI_API_KEY is set).
 * @see https://serpapi.com/google-trends-api
 */

const SERPAPI_URL = 'https://serpapi.com/search.json';
const TRENDS_TZ_IL = -180;

function getApiKey() {
  return (process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY || '').trim();
}

/**
 * @param {number} days
 * @param {Date} endTime
 */
export function serpDateForWindow(days, endTime = new Date()) {
  if (days <= 1) return 'now 1-d';
  if (days >= 7) return 'now 7-d';
  const end = new Date(endTime);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return `${fmt(start)} ${fmt(end)}`;
}

async function serpFetch(params) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('SERPAPI_API_KEY not set');
  const url = new URL(SERPAPI_URL);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('engine', 'google_trends');
  url.searchParams.set('hl', 'iw');
  url.searchParams.set('tz', String(TRENDS_TZ_IL));
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || body.error) {
    throw new Error(body.error || `SerpAPI HTTP ${res.status}`);
  }
  return body;
}

function timelineToSeries(timelineData, keywords) {
  return (timelineData ?? []).map((row) => {
    const date = String(row.date ?? '').replace(/,.*$/, '').trim()
      || (row.timestamp
        ? new Date(Number(row.timestamp) * 1000).toISOString().slice(0, 10)
        : '');
    /** @type {Record<string, number>} */
    const values = {};
    const vals = row.values ?? [];
    keywords.forEach((kw, i) => {
      const match = vals.find((v) => v.query === kw) ?? vals[i];
      const n = Number(match?.extracted_value ?? match?.value ?? 0);
      values[kw] = Number.isFinite(n) ? n : 0;
    });
    return { date, values };
  });
}

function mapSerpRelated(list) {
  return (list ?? []).slice(0, 15).map((item) => ({
    query: String(item.query ?? ''),
    value: Number(item.extracted_value ?? item.value ?? 0) || 0,
    formattedValue: String(item.value ?? item.link ?? ''),
  }));
}

/**
 * @returns {import('../../domain/ports/ISearchTrendsPort.js').ISearchTrendsPort | null}
 */
export function createSerpApiTrendsAdapter() {
  if (!getApiKey()) return null;

  return {
    async interestOverTime({ keywords, geo, startTime, endTime }) {
      const kws = keywords.filter(Boolean);
      if (!kws.length) return { series: [], keywords: [] };
      const days = Math.max(1, Math.ceil((endTime - startTime) / 86400000));
      const allSeries = [];
      for (let i = 0; i < kws.length; i += 5) {
        const batch = kws.slice(i, i + 5);
        const json = await serpFetch({
          q: batch.join(','),
          data_type: 'TIMESERIES',
          geo: geo || 'IL',
          date: serpDateForWindow(days, endTime),
        });
        const part = timelineToSeries(json.interest_over_time?.timeline_data, batch);
        if (!allSeries.length) {
          allSeries.push(...part);
        } else {
          for (let j = 0; j < part.length; j += 1) {
            if (!allSeries[j]) allSeries[j] = { date: part[j].date, values: {} };
            Object.assign(allSeries[j].values, part[j].values);
          }
        }
      }
      return {
        series: allSeries.map((row) => ({ date: row.date, values: row.values })),
        keywords: kws,
      };
    },

    async relatedQueries({ keyword, geo, startTime, endTime }) {
      const days = Math.max(1, Math.ceil((endTime - startTime) / 86400000));
      const json = await serpFetch({
        q: keyword,
        data_type: 'RELATED_QUERIES',
        geo: geo || 'IL',
        date: serpDateForWindow(days, endTime),
      });
      const rq = json.related_queries ?? {};
      return {
        rising: mapSerpRelated(rq.rising),
        top: mapSerpRelated(rq.top),
      };
    },

    async interestByRegion({ keyword, startTime, endTime }) {
      const days = Math.max(1, Math.ceil((endTime - startTime) / 86400000));
      const json = await serpFetch({
        q: keyword,
        data_type: 'GEO_MAP_0',
        geo: 'IL',
        region: 'REGION',
        date: serpDateForWindow(days, endTime),
      });
      const compared = json.compared_breakdown_by_region ?? json.interest_by_region ?? [];
      const rows = Array.isArray(compared) ? compared : compared?.geo_map_data ?? [];
      return rows
        .map((r) => ({
          geoCode: String(r.geo ?? r.geo_code ?? ''),
          geoName: String(r.location ?? r.geo_name ?? ''),
          value: Number(r.extracted_value ?? r.value ?? 0) || 0,
        }))
        .filter((r) => r.geoCode || r.geoName)
        .sort((a, b) => b.value - a.value);
    },
  };
}
