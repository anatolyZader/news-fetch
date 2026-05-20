import { TREND_DISTRICTS } from '../trendDistricts.js';
import { classifyTrendQuery } from './trendSignalClassifier.js';
import { projectSearchAttentionToComponents } from './trendComponentProjection.js';

const GROUP_WEIGHTS = Object.freeze({
  emergency: 0.5,
  psycho: 0.35,
  services: 0.15,
});

/**
 * @param {string} query
 * @returns {'emergency'|'services'|'psycho'|'other'}
 */
export function classifyQueryGroup(query) {
  return classifyTrendQuery(query).themeGroup;
}

/**
 * @param {string} formattedValue
 * @returns {'rising'|'sustained'}
 */
export function classifyQueryMomentum(formattedValue) {
  return classifyTrendQuery('', formattedValue).momentum;
}

/**
 * @param {Array<{ id: string, group: string, latest?: number, changePct?: number | null }>} topics
 * @param {string} [topicGroupFilter]
 */
export function computeGroupStressIndex(topics, topicGroupFilter = 'all') {
  const list = topicGroupFilter === 'all'
    ? topics
    : topics.filter((t) => t.group === topicGroupFilter);
  if (!list.length) return { index: 0, changePct: null };

  let weightSum = 0;
  let index = 0;
  let changeWeighted = 0;
  let changeWeight = 0;

  for (const t of list) {
    const w = GROUP_WEIGHTS[t.group] ?? 0.2;
    weightSum += w;
    index += (t.latest ?? 0) * w;
    if (t.changePct != null) {
      changeWeighted += t.changePct * w;
      changeWeight += w;
    }
  }

  return {
    index: weightSum > 0 ? Math.round(index / weightSum) : 0,
    changePct: changeWeight > 0 ? Math.round(changeWeighted / changeWeight) : null,
  };
}

/**
 * @param {'low'|'elevated'|'spike'} band
 */
export function interestBand(latest, changePct) {
  const v = latest ?? 0;
  const d = changePct ?? 0;
  if (v >= 70 || d >= 25) return 'spike';
  if (v >= 45 || d >= 12) return 'elevated';
  return 'low';
}

/**
 * @param {Array<Record<string, unknown>>} timeSeries
 * @param {string} topicId
 * @param {number} [maxPoints]
 */
export function extractSparkline(timeSeries, topicId, maxPoints = 14) {
  if (!timeSeries?.length) return [];
  const slice = timeSeries.slice(-maxPoints);
  return slice.map((row) => Number(row[topicId]) || 0);
}

/**
 * @param {object} opts
 * @param {Array<{ id: string, group: string, latest?: number, changePct?: number | null }>} opts.topics
 * @param {string} opts.districtLabelKey
 * @param {string} [opts.topicGroup]
 * @param {{ index: number, changePct: number | null } | null} [opts.nationalStress]
 */
export function buildAttentionSummary(opts) {
  const { topics, districtLabelKey, topicGroup = 'all', nationalStress } = opts;
  const stress = computeGroupStressIndex(topics, topicGroup);
  const band = interestBand(stress.index, stress.changePct);
  const vsNational =
    nationalStress != null
      ? stress.index - nationalStress.index
      : null;

  let level = 'steady';
  if (band === 'spike' || (stress.changePct != null && stress.changePct >= 20)) level = 'elevated';
  else if (band === 'elevated' || (stress.changePct != null && stress.changePct >= 8)) level = 'rising';
  else if (stress.changePct != null && stress.changePct <= -8) level = 'falling';

  const nationalLine =
    vsNational == null
      ? 'aligned'
      : vsNational >= 8
        ? 'aboveNational'
        : vsNational <= -8
          ? 'belowNational'
          : 'aligned';

  return {
    index: stress.index,
    changePct: stress.changePct,
    vsNationalDelta: vsNational,
    level,
    nationalLine,
    band,
    districtLabelKey,
    topicGroup,
    narrativeKey: `trends.attention.${level}.${nationalLine}`,
    narrativeParams: {
      change: stress.changePct != null ? String(stress.changePct) : '—',
      vsNational: vsNational != null ? String(vsNational) : '0',
    },
  };
}

/**
 * @param {Array<{ query: string, formattedValue: string }>} queries
 */
function enrichQueryRows(queries) {
  return (queries ?? []).map((row) => {
    const classified = classifyTrendQuery(row.query, row.formattedValue);
    return {
      ...row,
      group: classified.themeGroup,
      momentum: classified.momentum,
      signalTypes: classified.signalTypes,
      lexiconHits: classified.lexiconHits,
    };
  });
}

/**
 * @param {Array<{ query: string, formattedValue: string, group: string, momentum: string }>} rows
 */
function groupQueriesByTheme(rows) {
  /** @type {Record<string, typeof rows>} */
  const out = { emergency: [], services: [], psycho: [], other: [] };
  for (const row of rows) {
    const g = out[row.group] ?? out.other;
    g.push(row);
  }
  return out;
}

/**
 * @param {Array<{ districtId: string, labelKey: string, value: number }>} regionBreakdown
 * @param {number} districtIndex
 * @param {number | null} nationalIndex
 */
export function computeDistrictLeaders(regionBreakdown, districtIndex, nationalIndex) {
  const sorted = [...(regionBreakdown ?? [])].sort((a, b) => b.value - a.value);
  return {
    leaders: sorted.slice(0, 2),
    laggards: sorted.slice(-2).reverse(),
    spreadVsNational:
      nationalIndex != null && districtIndex != null
        ? districtIndex - nationalIndex
        : null,
  };
}

/**
 * @param {Array<{ id: string, labelKey: string, latest?: number, changePct?: number | null }>} topics
 * @param {Array<Record<string, unknown>>} timeSeries
 * @param {Array<Record<string, unknown>>} [nationalTimeSeries]
 */
export function computeTopicDeepDives(topics, timeSeries, nationalTimeSeries) {
  return topics.map((topic) => ({
    topicId: topic.id,
    labelKey: topic.labelKey,
    latest: topic.latest ?? 0,
    changePct: topic.changePct,
    band: interestBand(topic.latest, topic.changePct),
    sparklineLocal: extractSparkline(timeSeries, topic.id),
    sparklineNational: extractSparkline(nationalTimeSeries ?? [], topic.id),
  }));
}

/**
 * @param {Array<{ districtId: string, labelKey?: string, topics: Array<{ latest?: number }> }>} snapshots
 */
export function computeDistrictRankingFromSnapshots(snapshots) {
  const rows = (snapshots ?? [])
    .filter((s) => s.districtId && s.districtId !== 'national')
    .map((s) => {
      const topics = s.topics ?? [];
      const avg =
        topics.length > 0
          ? Math.round(
              topics.reduce((sum, t) => sum + (t.latest ?? 0), 0) / topics.length,
            )
          : 0;
      const district = TREND_DISTRICTS.find((d) => d.id === s.districtId);
      return {
        districtId: s.districtId,
        labelKey: district?.labelKey ?? s.districtId,
        value: avg,
      };
    })
    .sort((a, b) => b.value - a.value);

  return {
    leaders: rows.slice(0, 2),
    laggards: rows.slice(-2).reverse(),
  };
}

/**
 * @param {object} dashboard
 * @param {{ nationalDashboard?: object | null, districtSnapshots?: Array<{ districtId: string, topics: object[] }> }} ctx
 */
export function enrichDashboardAnalytics(dashboard, ctx = {}) {
  const { nationalDashboard, districtSnapshots = [] } = ctx;
  const topics = dashboard.topics ?? [];
  const timeSeries = dashboard.timeSeries ?? [];
  const topicGroup = 'all';

  const nationalStress = nationalDashboard
    ? computeGroupStressIndex(nationalDashboard.topics ?? [], topicGroup)
    : dashboard.district?.id === 'national'
      ? computeGroupStressIndex(topics, topicGroup)
      : null;

  const districtStress = computeGroupStressIndex(topics, topicGroup);
  const attention = buildAttentionSummary({
    topics,
    districtLabelKey: dashboard.district?.labelKey ?? 'district.national',
    topicGroup,
    nationalStress: dashboard.district?.id === 'national' ? districtStress : nationalStress,
  });

  const popularEnriched = enrichQueryRows(dashboard.popularQueries);
  const risingEnriched = enrichQueryRows(dashboard.risingQueries);

  const districtIndex = districtStress.index;
  const nationalIndex = nationalStress?.index ?? null;

  const leaderBlock =
    (dashboard.regionBreakdown?.length ?? 0) > 0
      ? computeDistrictLeaders(dashboard.regionBreakdown, districtIndex, nationalIndex)
      : {
          ...computeDistrictRankingFromSnapshots(districtSnapshots),
          spreadVsNational:
            nationalIndex != null && dashboard.district?.id !== 'national'
              ? districtIndex - nationalIndex
              : null,
        };

  return {
    attention,
    components: projectSearchAttentionToComponents({
      topics,
      timeSeries,
      popularQueries: dashboard.popularQueries,
      risingQueries: dashboard.risingQueries,
    }),
    districtComparison: {
      ...leaderBlock,
      districtIndex,
      nationalIndex,
    },
    queriesIntel: {
      popular: popularEnriched,
      rising: risingEnriched,
      popularByGroup: groupQueriesByTheme(popularEnriched),
      risingByGroup: groupQueriesByTheme(risingEnriched),
    },
    topicDeepDives: computeTopicDeepDives(
      topics,
      timeSeries,
      nationalDashboard?.timeSeries,
    ),
  };
}
