import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectSearchAttentionToComponents } from '../../../../business_modules/search_trends/domain/services/trendComponentProjection.js';
import { classifyTrendQuery } from '../../../../business_modules/search_trends/domain/services/trendSignalClassifier.js';

describe('trendComponentProjection', () => {
  it('projects topics through signed SIGNAL_TO_COMPONENTS weights', () => {
    const rows = projectSearchAttentionToComponents({
      topics: [
        { id: 'alerts', latest: 80, changePct: 25 },
        { id: 'anxiety', latest: 30, changePct: 5 },
      ],
      timeSeries: [
        { date: '2026-05-10', alerts: 40, anxiety: 20 },
        { date: '2026-05-11', alerts: 80, anxiety: 30 },
      ],
      popularQueries: [],
      risingQueries: [],
    });

    const lifesaving = rows.find((r) => r.componentId === 'lifesaving_behavior');
    const wellbeing = rows.find((r) => r.componentId === 'wellbeing_atrisk');
    assert.ok(lifesaving.sai > 0);
    assert.ok(wellbeing.sai > 0);
    assert.ok(lifesaving.sai !== wellbeing.sai || lifesaving.netPressure !== wellbeing.netPressure);
    assert.ok(['support', 'pressure', 'mixed'].includes(lifesaving.direction));
    assert.ok(lifesaving.topSignals.length > 0);
  });

  it('does not duplicate identical max across leadership and information from one topic', () => {
    const rows = projectSearchAttentionToComponents({
      topics: [{ id: 'home_front', latest: 70, changePct: 10 }],
      timeSeries: [{ date: 'd1', home_front: 70 }],
      popularQueries: [],
      risingQueries: [],
    });
    const info = rows.find((r) => r.componentId === 'information_communication');
    const lead = rows.find((r) => r.componentId === 'leadership');
    assert.ok(info.sai > 0);
    assert.ok(lead.sai < info.sai || lead.netPressure !== info.netPressure);
  });

  it('gives narrative attention from lexicon-classified queries', () => {
    const rows = projectSearchAttentionToComponents({
      topics: [],
      timeSeries: [],
      popularQueries: [{ query: 'מי אשם במלחמה', formattedValue: '100' }],
      risingQueries: [],
    });
    const narrative = rows.find((r) => r.componentId === 'narrative');
    assert.ok(narrative.sai > 0);
    assert.ok(classifyTrendQuery('מי אשם').signalTypes.some((s) => s.type === 'blame_narrative'));
  });

  it('returns all eight components', () => {
    const rows = projectSearchAttentionToComponents({
      topics: [{ id: 'schools', latest: 50, changePct: 0 }],
      timeSeries: [],
      popularQueries: [],
      risingQueries: [],
    });
    assert.equal(rows.length, 8);
  });
});
