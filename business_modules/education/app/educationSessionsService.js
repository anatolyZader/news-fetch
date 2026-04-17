import { fetchEducationSessions } from '../infrastructure/googleSheetsAdapter.js';

function countValues(arr) {
  const out = {};
  for (const v of arr) {
    if (v) out[v] = (out[v] || 0) + 1;
  }
  return out;
}

function groupByDate(sessions) {
  const map = {};
  for (const s of sessions) {
    if (!map[s.date]) map[s.date] = [];
    map[s.date].push(s);
  }
  return map;
}

export async function getEducationDashboard({ forceRefresh = false } = {}) {
  const sessions = await fetchEducationSessions({ forceRefresh });

  if (sessions.length === 0) {
    return { trends: [], distributions: {}, summary: null, recentComments: [] };
  }

  const sorted = [...sessions].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Per-date aggregates for temporal trend charts
  const byDate = groupByDate(sorted);
  const dates = Object.keys(byDate).sort();

  const trends = dates.map(date => {
    const rows = byDate[date];
    const avgChildren = Math.round(rows.reduce((s, r) => s + r.childrenCount, 0) / rows.length);
    const totalActivities = rows.reduce((s, r) => s + r.activityCount, 0);
    return {
      date,
      respondents: rows.length,
      avgChildren,
      totalActivities,
      copingDist:          countValues(rows.map(r => r.copingLevel)),
      streetMovementDist:  countValues(rows.map(r => r.streetMovement)),
      informalContactDist: countValues(rows.map(r => r.informalContactFreq)),
      concerningTrendsDist:countValues(rows.flatMap(r => r.concerningTrends)),
      exposureMethodDist:  countValues(rows.flatMap(r => r.exposureMethod)),
      interventionDist:    countValues(rows.map(r => r.interventionNeeded)),
    };
  });

  // Aggregate distributions across all sessions
  const all = sorted;
  const distributions = {
    ageRanges:           countValues(all.flatMap(r => r.ageRanges)),
    activityType:        countValues(all.flatMap(r => r.activityType)),
    activityHours:       countValues(all.flatMap(r => r.activityHours)),
    streetMovement:      countValues(all.map(r => r.streetMovement)),
    informalContactFreq: countValues(all.map(r => r.informalContactFreq)),
    concerningTrends:    countValues(all.flatMap(r => r.concerningTrends)),
    exposureMethod:      countValues(all.flatMap(r => r.exposureMethod)),
    interventionNeeded:  countValues(all.map(r => r.interventionNeeded)),
    copingLevel:         countValues(all.map(r => r.copingLevel)),
  };

  const summary = {
    totalResponses: all.length,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
    settlements: [...new Set(all.map(r => r.settlement).filter(Boolean))],
    latestDate: dates[dates.length - 1],
  };

  const recentComments = sorted
    .filter(r => r.openComment)
    .slice(-10)
    .reverse()
    .map(r => ({ date: r.date, settlement: r.settlement, comment: r.openComment }));

  const communityActivitiesComments = sorted
    .filter(r => r.communityActivities)
    .slice(-15)
    .reverse()
    .map(r => ({ date: r.date, settlement: r.settlement, comment: r.communityActivities }));

  // Per-settlement breakdown
  const settlementNames = [...new Set(all.map(r => r.settlement).filter(Boolean))].sort();
  const bySettlement = {};
  for (const name of settlementNames) {
    const rows = all.filter(r => r.settlement === name);
    const sByDate = groupByDate(rows);
    const sDates = Object.keys(sByDate).sort();
    bySettlement[name] = {
      name,
      totalResponses: rows.length,
      sessionDates: sDates,
      trends: sDates.map(date => {
        const dr = sByDate[date];
        const nonZeroChildren = dr.filter(r => r.childrenCount > 0);
        return {
          date,
          respondents: dr.length,
          avgChildren: nonZeroChildren.length
            ? Math.round(nonZeroChildren.reduce((s, r) => s + r.childrenCount, 0) / nonZeroChildren.length)
            : 0,
          totalActivities: dr.reduce((s, r) => s + r.activityCount, 0),
          copingDist:           countValues(dr.map(r => r.copingLevel)),
          streetMovementDist:   countValues(dr.map(r => r.streetMovement)),
          informalContactDist:  countValues(dr.map(r => r.informalContactFreq)),
          concerningTrendsDist: countValues(dr.flatMap(r => r.concerningTrends)),
          interventionDist:     countValues(dr.map(r => r.interventionNeeded)),
        };
      }),
      comments: rows
        .filter(r => r.openComment)
        .map(r => ({ date: r.date, comment: r.openComment }))
        .reverse(),
      communityComments: rows
        .filter(r => r.communityActivities)
        .map(r => ({ date: r.date, comment: r.communityActivities }))
        .reverse(),
    };
  }

  return { sessions: sorted, trends, distributions, summary, recentComments, communityActivitiesComments, bySettlement };
}
