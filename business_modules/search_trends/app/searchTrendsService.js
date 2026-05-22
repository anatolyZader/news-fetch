import { resolveTrendDistrict, TREND_DISTRICTS } from '../domain/trendDistricts.js';
import { normalizeTrendWindowDays, TREND_WINDOW_DAYS } from '../domain/trendWindowDays.js';
import { TREND_TOPIC_GROUPS } from '../domain/trendTopicGroups.js';
import {
  TREND_QUERY_TOPICS,
  PRIMARY_TREND_KEYWORDS,
  SECONDARY_TREND_KEYWORDS,
} from '../domain/trendQueryTopics.js';
import { createTrendsPort } from '../infrastructure/adapters/createTrendsPort.js';
import { createTrendsDashboardCacheAdapter } from '../infrastructure/adapters/trendsDashboardCacheAdapter.js';
import { enrichDashboardAnalytics } from '../domain/services/trendsDashboardAnalytics.js';
import { normalizeIsraelDistrictRefs } from '../../../cross-cut-modules/geo/israelDistricts.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mergeSeries(primary, secondary, topics) {
  const byDate = new Map();
  for (const row of primary.series) {
    byDate.set(row.date, { date: row.date });
  }
  for (const row of secondary.series) {
    if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date });
  }
  for (const row of primary.series) {
    const entry = byDate.get(row.date);
    for (const topic of topics.slice(0, 5)) {
      const v = row.values[topic.keyword];
      if (v != null) entry[topic.id] = v;
    }
  }
  for (const row of secondary.series) {
    const entry = byDate.get(row.date);
    for (const topic of topics.slice(5)) {
      const v = row.values[topic.keyword];
      if (v != null) entry[topic.id] = v;
    }
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function latestAndDelta(series, topicId, days) {
  if (!series.length) return { latest: 0, changePct: null };
  const last = series[series.length - 1]?.[topicId] ?? 0;
  const lookback = Math.min(days, series.length - 1);
  const prevIdx = Math.max(0, series.length - 1 - lookback);
  const prev = series[prevIdx]?.[topicId];
  const changePct =
    prev != null && prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;
  return { latest: last, changePct };
}

function buildDemoDashboard(district, days) {
  const topics = TREND_QUERY_TOPICS;
  const series = [];
  const end = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const date = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const row = { date };
    topics.forEach((t, idx) => {
      const base = 20 + idx * 8 + (district.id === 'north' ? 15 : 0);
      row[t.id] = Math.min(100, Math.max(0, Math.round(base + 12 * Math.sin(i / 4 + idx))));
    });
    series.push(row);
  }
  return {
    district: { id: district.id, geo: district.geo, labelKey: district.labelKey },
    days,
    generatedAt: new Date().toISOString(),
    source: 'demo',
    topics: topics.map((t) => {
      const { latest, changePct } = latestAndDelta(series, t.id, days);
      return { id: t.id, labelKey: t.labelKey, group: t.group, latest, changePct };
    }),
    timeSeries: series,
    risingQueries: [
      { query: 'הנחיות פיקוד העורף', formattedValue: '+120%' },
      { query: 'מקלט ציבורי', formattedValue: '+80%' },
    ],
    popularQueries: [
      { query: 'מקלט ציבורי', formattedValue: '100' },
      { query: 'הנחיות פיקוד העורף', formattedValue: '85' },
      { query: 'סגירת בתי ספר', formattedValue: '62' },
    ],
    relatedSeedLabelKey: 'trends.topic.alerts',
    regionBreakdown: TREND_DISTRICTS.filter((d) => d.id !== 'national').map((d, i) => ({
      geoCode: d.geo,
      districtId: d.id,
      labelKey: d.labelKey,
      value: Math.max(10, 90 - i * 12),
    })),
    topicGroups: TREND_TOPIC_GROUPS.map((g) => ({ id: g.id, labelKey: g.labelKey })),
    disclaimerKey: 'trends.disclaimer',
  };
}

/**
 * @param {ReturnType<typeof createTrendsDashboardCacheAdapter>} cache
 * @param {number} days
 */
async function loadDistrictSnapshots(cache, days) {
  /** @type {Array<{ districtId: string, labelKey: string, topics: object[] }>} */
  const out = [];
  for (const district of TREND_DISTRICTS) {
    const snap = (await cache.read(district.id, days))
      ?? (typeof cache.readStale === 'function'
        ? await cache.readStale(district.id, days)
        : null);
    if (snap?.topics?.length) {
      out.push({
        districtId: district.id,
        labelKey: district.labelKey,
        topics: snap.topics,
      });
    }
  }
  return out;
}

/**
 * @param {object} payload
 * @param {ReturnType<typeof createTrendsDashboardCacheAdapter>} cache
 * @param {number} days
 */
async function finalizeDashboard(payload, cache, days) {
  let districtSnapshots = await loadDistrictSnapshots(cache, days);
  if (payload.source === 'demo' && districtSnapshots.length < 3) {
    districtSnapshots = TREND_DISTRICTS.map((d) => ({
      districtId: d.id,
      labelKey: d.labelKey,
      topics: buildDemoDashboard(d, days).topics,
    }));
  }
  const nationalDashboard =
    payload.district?.id === 'national'
      ? payload
      : (await cache.read('national', days))
        ?? (typeof cache.readStale === 'function'
          ? await cache.readStale('national', days)
          : null)
        ?? (payload.source === 'demo' ? buildDemoDashboard(resolveTrendDistrict('national'), days) : null);

  return normalizeIsraelDistrictRefs({
    ...payload,
    analytics: enrichDashboardAnalytics(payload, { nationalDashboard, districtSnapshots }),
  });
}

/**
 * @param {{ trendsPort?: import('../domain/ports/ISearchTrendsPort.js').ISearchTrendsPort, cache?: ReturnType<typeof createTrendsDashboardCacheAdapter>, useLive?: boolean }} [deps]
 */
export function createSearchTrendsService(deps = {}) {
  const trendsPort = deps.trendsPort ?? createTrendsPort();
  const cache = deps.cache ?? createTrendsDashboardCacheAdapter();
  const useLive = deps.useLive !== false && process.env.TRENDS_DEMO_MODE !== '1';

  return {
    listDistricts() {
      return TREND_DISTRICTS.map((d) => ({
        id: d.id,
        geo: d.geo,
        labelKey: d.labelKey,
      }));
    },

    listTopicGroups() {
      return TREND_TOPIC_GROUPS.map((g) => ({ id: g.id, labelKey: g.labelKey }));
    },

    /**
     * Pre-fetch live dashboards for every district × time window (for nightly cron).
     * @param {{ delayMs?: number }} [opts]
     */
    async warmCache(opts = {}) {
      const delayMs = Number.isFinite(opts.delayMs) ? opts.delayMs : 2500;
      /** @type {Array<{ district: string, days: number, ok: boolean, source?: string, error?: string }>} */
      const results = [];
      for (const district of TREND_DISTRICTS) {
        for (const days of TREND_WINDOW_DAYS) {
          try {
            const payload = await this.getDashboard({
              districtId: district.id,
              days,
              refresh: true,
            });
            results.push({
              district: district.id,
              days,
              ok: true,
              source: payload.source,
            });
          } catch (err) {
            results.push({
              district: district.id,
              days,
              ok: false,
              error: err?.message ?? 'warm failed',
            });
          }
          if (delayMs > 0) await sleep(delayMs);
        }
      }
      return {
        warmedAt: new Date().toISOString(),
        total: results.length,
        ok: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      };
    },

    /**
     * @param {{ districtId?: string, days?: number, refresh?: boolean }} opts
     */
    async getDashboard(opts = {}) {
      const district = resolveTrendDistrict(opts.districtId);
      const days = normalizeTrendWindowDays(opts.days, 7);
      const refresh = opts.refresh === true;

      if (!refresh) {
        const cached = await cache.read(district.id, days);
        if (cached) {
          return finalizeDashboard({ ...cached, source: 'cache' }, cache, days);
        }
      }

      if (!useLive) {
        const demo = buildDemoDashboard(district, days);
        await cache.write(district.id, days, demo);
        return finalizeDashboard(demo, cache, days);
      }

      const endTime = new Date();
      const startTime = new Date(endTime);
      startTime.setDate(startTime.getDate() - days);

      try {
        const primary = await trendsPort.interestOverTime({
          keywords: PRIMARY_TREND_KEYWORDS,
          geo: district.geo,
          startTime,
          endTime,
        });
        await sleep(400);
        const secondary = await trendsPort.interestOverTime({
          keywords: SECONDARY_TREND_KEYWORDS,
          geo: district.geo,
          startTime,
          endTime,
        });
        await sleep(400);
        let related = { rising: [], top: [] };
        try {
          related = await trendsPort.relatedQueries({
            keyword: PRIMARY_TREND_KEYWORDS[0],
            geo: district.geo,
            startTime,
            endTime,
          });
        } catch {
          /* charts still useful without related queries */
        }

        const timeSeries = mergeSeries(primary, secondary, TREND_QUERY_TOPICS);
        const topics = TREND_QUERY_TOPICS.map((t) => {
          const { latest, changePct } = latestAndDelta(timeSeries, t.id, days);
          return {
            id: t.id,
            labelKey: t.labelKey,
            group: t.group,
            latest,
            changePct,
          };
        });

        /** @type {Array<{ geoCode: string, districtId: string, labelKey: string, value: number }>} */
        let regionBreakdown = [];
        if (district.id === 'national') {
          await sleep(400);
          try {
            const regions = await trendsPort.interestByRegion({
              keyword: PRIMARY_TREND_KEYWORDS[0],
              startTime,
              endTime,
            });
            const geoToDistrict = Object.fromEntries(
              TREND_DISTRICTS.filter((d) => d.id !== 'national').map((d) => [d.geo, d]),
            );
            regionBreakdown = regions
              .map((r) => {
                const d = geoToDistrict[r.geoCode];
                if (!d) return null;
                return {
                  geoCode: r.geoCode,
                  districtId: d.id,
                  labelKey: d.labelKey,
                  value: r.value,
                };
              })
              .filter(Boolean);
          } catch {
            /* district bar chart optional */
          }
        }

        const payload = {
          district: { id: district.id, geo: district.geo, labelKey: district.labelKey },
          days,
          generatedAt: new Date().toISOString(),
          source: 'live',
          topics,
          timeSeries,
          risingQueries: (related.rising ?? []).slice(0, 12).map((r) => ({
            query: r.query,
            formattedValue: r.formattedValue || String(r.value),
          })),
          popularQueries: (related.top ?? []).slice(0, 12).map((r) => ({
            query: r.query,
            formattedValue: r.formattedValue || String(r.value),
          })),
          relatedSeedLabelKey: 'trends.topic.alerts',
          regionBreakdown,
          topicGroups: TREND_TOPIC_GROUPS.map((g) => ({ id: g.id, labelKey: g.labelKey })),
          disclaimerKey: 'trends.disclaimer',
        };
        await cache.write(district.id, days, payload);
        return finalizeDashboard(payload, cache, days);
      } catch (err) {
        const stale = await cache.readStale(district.id, days);
        if (stale) {
          return finalizeDashboard(
            {
              ...stale,
              source: 'stale',
              fetchError: err?.message ?? 'Google Trends fetch failed',
            },
            cache,
            days,
          );
        }
        const demo = buildDemoDashboard(district, days);
        return finalizeDashboard(
          {
            ...demo,
            source: 'demo',
            fetchError: err?.message ?? 'Google Trends fetch failed',
          },
          cache,
          days,
        );
      }
    },
  };
}
