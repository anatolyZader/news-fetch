import googleTrends from 'google-trends-api';
import { parseTrendsJson } from './parseTrendsJson.js';

/** Israel (Asia/Jerusalem) — minutes east of UTC for google-trends-api `timezone`. */
const TRENDS_TZ_IL = -180;

function timelineToSeries(parsed, keywords) {
  const rows = parsed?.default?.timelineData ?? [];
  return rows.map((row) => {
    const date = row.formattedTime
      ? String(row.formattedTime).replace(/,.*$/, '').trim()
      : new Date(Number(row.time) * 1000).toISOString().slice(0, 10);
    /** @type {Record<string, number>} */
    const values = {};
    const vals = Array.isArray(row.value) ? row.value : [row.value];
    keywords.forEach((kw, i) => {
      const n = Number(vals[i]);
      values[kw] = Number.isFinite(n) ? n : 0;
    });
    return { date, values };
  });
}

function daysSpan(startTime, endTime) {
  return Math.abs(endTime - startTime) / 86400000;
}

function mapRelatedList(list) {
  const ranked = list?.rankedList?.[1]?.rankedKeyword ?? list?.rankedList?.[0]?.rankedKeyword ?? [];
  return ranked.slice(0, 15).map((item) => ({
    query: String(item.query ?? item.topic?.title ?? ''),
    value: typeof item.value === 'number' ? item.value : 0,
    formattedValue: String(item.formattedValue ?? item.value ?? ''),
  }));
}

/**
 * @returns {import('../../domain/ports/ISearchTrendsPort.js').ISearchTrendsPort}
 */
export function createGoogleTrendsApiAdapter() {
  return {
    async interestOverTime({ keywords, geo, startTime, endTime }) {
      const kws = keywords.filter(Boolean);
      if (!kws.length) return { series: [], keywords: [] };
      const raw = await googleTrends.interestOverTime({
        keyword: kws.length === 1 ? kws[0] : kws,
        startTime,
        endTime,
        geo: geo || 'IL',
        hl: 'iw',
        timezone: TRENDS_TZ_IL,
        granularTimeResolution: daysSpan(startTime, endTime) <= 1,
      });
      const parsed = parseTrendsJson(raw, 'interestOverTime');
      return { series: timelineToSeries(parsed, kws), keywords: kws };
    },

    async relatedQueries({ keyword, geo, startTime, endTime }) {
      const raw = await googleTrends.relatedQueries({
        keyword,
        startTime,
        endTime,
        geo: geo || 'IL',
        hl: 'iw',
        timezone: TRENDS_TZ_IL,
      });
      const parsed = parseTrendsJson(raw, 'relatedQueries');
      const lists = parsed?.default?.rankedList ?? [];
      const rising = mapRelatedList({ rankedList: [lists[0]] });
      const top = mapRelatedList({ rankedList: [lists[1]] });
      return { rising, top };
    },

    async interestByRegion({ keyword, startTime, endTime }) {
      const raw = await googleTrends.interestByRegion({
        keyword,
        startTime,
        endTime,
        geo: 'IL',
        resolution: 'REGION',
        hl: 'iw',
        timezone: TRENDS_TZ_IL,
      });
      const parsed = parseTrendsJson(raw, 'interestByRegion');
      const rows = parsed?.default?.geoMapData ?? [];
      return rows
        .filter((r) => r?.hasData?.[0] !== false)
        .map((r) => ({
          geoCode: String(r.geoCode ?? ''),
          geoName: String(r.geoName ?? ''),
          value: Number(Array.isArray(r.value) ? r.value[0] : r.value) || 0,
        }))
        .sort((a, b) => b.value - a.value);
    },
  };
}
