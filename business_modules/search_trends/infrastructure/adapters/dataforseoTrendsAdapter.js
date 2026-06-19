/**
 * Google Trends via DataForSEO Keywords Data API (live explore).
 * @see https://docs.dataforseo.com/v3/keywords_data/google_trends/explore/live
 * security:trusted-vendor-fetch
 */

import { resolveDataforseoLocationName } from '../../domain/dataforseoDistrictLocations.js';

const DFS_EXPLORE_LIVE = 'https://api.dataforseo.com/v3/keywords_data/google_trends/explore/live';

function getCredentials() {
  const login = (process.env.DATAFORSEO_LOGIN || process.env.DATAFORSEO_USERNAME || '').trim();
  const password = (process.env.DATAFORSEO_PASSWORD || process.env.DATAFORSEO_API_PASSWORD || '').trim();
  if (!login || !password) return null;
  return Buffer.from(`${login}:${password}`, 'utf8').toString('base64');
}

/**
 * @param {number} days
 * @param {Date} endTime
 */
export function dataforseoTaskTiming(days, endTime = new Date()) {
  if (days <= 1) {
    return { time_range: 'past_day' };
  }
  if (days === 7) {
    return { time_range: 'past_7_days' };
  }
  const end = new Date(endTime);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return {
    date_from: start.toISOString().slice(0, 10),
    date_to: end.toISOString().slice(0, 10),
  };
}

function assertTaskOk(body) {
  if (body?.status_code !== 20000) {
    throw new Error(body?.status_message || 'DataForSEO request failed');
  }
  const task = body.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(task?.status_message || 'DataForSEO task failed');
  }
  const result = task.result?.[0];
  if (!result) {
    throw new Error('DataForSEO returned no result');
  }
  return result;
}

/**
 * @param {Record<string, unknown>} taskFields
 */
async function exploreLive(taskFields) {
  const cred = getCredentials();
  if (!cred) throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD not set');

  const res = await fetch(DFS_EXPLORE_LIVE, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${cred}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      {
        language_code: 'iw',
        type: 'web',
        ...taskFields,
      },
    ]),
  });

  const body = await res.json().catch(() => ({}));
  const task = body?.tasks?.[0];
  // HTTP 402 etc. can return top-level status_message "Ok." while the task carries the real error.
  if (!res.ok) {
    throw new Error(
      task?.status_message || body?.status_message || `DataForSEO HTTP ${res.status}`,
    );
  }
  return assertTaskOk(body);
}

/**
 * @param {import('../../domain/ports/ISearchTrendsPort.js').InterestOverTimeResult['series']} rows
 * @param {{ date: string, values: Record<string, number> }} row
 */
function mergeTimelineRow(rows, row) {
  const existing = rows.find((r) => r.date === row.date);
  if (existing) {
    Object.assign(existing.values, row.values);
  } else {
    rows.push(row);
  }
}

function graphItemToSeries(item, keyword) {
  const points = item?.data ?? [];
  return points.map((pt) => {
    const date =
      pt.date_from ||
      (pt.timestamp
        ? new Date(Number(pt.timestamp) * 1000).toISOString().slice(0, 10)
        : '');
    return {
      date: String(date),
      values: { [keyword]: Number(pt.values) || 0 },
    };
  });
}

function findItem(items, type) {
  return (items ?? []).find((it) => it.type === type);
}

function mapQueriesList(list) {
  return (list ?? []).slice(0, 15).map((item) => ({
    query: String(item.query ?? item.topic_title ?? ''),
    value: Number.parseInt(String(item.value ?? '0').replaceAll(/[^\d-]/g, ''), 10) || 0,
    formattedValue: String(item.value ?? ''),
  }));
}

/**
 * @returns {import('../../domain/ports/ISearchTrendsPort.js').ISearchTrendsPort | null}
 */
export function createDataforseoTrendsAdapter() {
  if (!getCredentials()) return null;

  return {
    async interestOverTime({ keywords, geo, startTime, endTime }) {
      const kws = keywords.filter(Boolean);
      if (!kws.length) return { series: [], keywords: [] };

      const days = Math.max(1, Math.ceil((endTime - startTime) / 86400000));
      const location_name = resolveDataforseoLocationName(geo);
      const timing = dataforseoTaskTiming(days, endTime);

      /** @type {import('../../domain/ports/ISearchTrendsPort.js').InterestOverTimeResult['series']} */
      const series = [];

      for (const keyword of kws) {
        const result = await exploreLive({
          keywords: [keyword],
          location_name,
          item_types: ['google_trends_graph'],
          ...timing,
        });
        const graph = findItem(result.items, 'google_trends_graph');
        for (const row of graphItemToSeries(graph, keyword)) {
          mergeTimelineRow(series, row);
        }
      }

      series.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return { series, keywords: kws };
    },

    async relatedQueries({ keyword, geo, startTime, endTime }) {
      const days = Math.max(1, Math.ceil((endTime - startTime) / 86400000));
      const result = await exploreLive({
        keywords: [keyword],
        location_name: resolveDataforseoLocationName(geo),
        item_types: ['google_trends_queries_list'],
        ...dataforseoTaskTiming(days, endTime),
      });
      const block = findItem(result.items, 'google_trends_queries_list');
      const data = block?.data ?? {};
      return {
        rising: mapQueriesList(data.rising),
        top: mapQueriesList(data.top),
      };
    },

    async interestByRegion({ keyword, startTime, endTime }) {
      const days = Math.max(1, Math.ceil((endTime - startTime) / 86400000));
      const result = await exploreLive({
        keywords: [keyword],
        location_name: 'Israel',
        item_types: ['google_trends_map'],
        ...dataforseoTaskTiming(days, endTime),
      });
      const mapItem = findItem(result.items, 'google_trends_map');
      return (mapItem?.data ?? [])
        .map((r) => ({
          geoCode: String(r.geo_id ?? ''),
          geoName: String(r.geo_name ?? ''),
          value: Number(r.values) || 0,
        }))
        .filter((r) => r.geoCode || r.geoName)
        .sort((a, b) => b.value - a.value);
    },
  };
}
