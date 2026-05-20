import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyQueryGroup,
  computeGroupStressIndex,
  enrichDashboardAnalytics,
  interestBand,
} from '../../../../business_modules/search_trends/domain/services/trendsDashboardAnalytics.js';

describe('trendsDashboardAnalytics', () => {
  it('classifies Hebrew queries into theme groups', () => {
    assert.equal(classifyQueryGroup('הנחיות פיקוד העורף'), 'emergency');
    assert.equal(classifyQueryGroup('חרדה ולחץ'), 'psycho');
    assert.equal(classifyQueryGroup('סגירת בתי ספר'), 'services');
  });

  it('computes weighted stress index', () => {
    const topics = [
      { id: 'alerts', group: 'emergency', latest: 80, changePct: 20 },
      { id: 'anxiety', group: 'psycho', latest: 40, changePct: 5 },
    ];
    const stress = computeGroupStressIndex(topics);
    assert.ok(stress.index > 50);
    assert.ok(stress.changePct != null && stress.changePct > 0);
  });

  it('enriches dashboard with analytics blocks', () => {
    const dashboard = {
      district: { id: 'north', labelKey: 'trends.district.north' },
      topics: [
        { id: 'alerts', group: 'emergency', latest: 70, changePct: 15, labelKey: 'trends.topic.alerts' },
        { id: 'anxiety', group: 'psycho', latest: 50, changePct: 10, labelKey: 'trends.topic.anxiety' },
      ],
      timeSeries: [
        { date: '2026-05-10', alerts: 40, anxiety: 30 },
        { date: '2026-05-11', alerts: 70, anxiety: 50 },
      ],
      popularQueries: [{ query: 'מקלט', formattedValue: '100' }],
      risingQueries: [{ query: 'אזעקות היום', formattedValue: '+90%' }],
      regionBreakdown: [],
    };
    const national = {
      topics: [
        { id: 'alerts', group: 'emergency', latest: 55, changePct: 8 },
        { id: 'anxiety', group: 'psycho', latest: 45, changePct: 6 },
      ],
      timeSeries: [],
    };
    const analytics = enrichDashboardAnalytics(dashboard, {
      nationalDashboard: national,
      districtSnapshots: [
        { districtId: 'north', topics: dashboard.topics },
        { districtId: 'south', topics: [{ id: 'alerts', latest: 30 }] },
      ],
    });
    assert.ok(analytics.attention.index > 0);
    const lifesaving = analytics.components.find((c) => c.componentId === 'lifesaving_behavior');
    assert.ok(lifesaving?.sai > 0);
    assert.ok(lifesaving.direction);
    assert.ok(analytics.queriesIntel.popular[0].signalTypes?.length >= 0);
    assert.equal(analytics.queriesIntel.popular[0].group, 'emergency');
    assert.equal(interestBand(75, 30), 'spike');
  });
});
