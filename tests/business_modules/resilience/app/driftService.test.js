import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createDriftService } from '../../../../business_modules/resilience/app/driftService.js';
import { COMPONENT_IDS } from '../../../../business_modules/resilience/domain/services/behaviorSignals.js';

function buildHistory() {
  return [
    {
      date: '2026-05-01', scope: 'national',
      total_articles_analyzed: 12,
      overall_score: 6,
      components: [
        { component_id: 'narrative', score: 7, confidence: 'high', certainty: 0.8, polarization: 0.1, evidence_mass: 8, signal_count: 5 },
        { component_id: 'leadership', score: 5, confidence: 'medium', certainty: 0.55, polarization: 0.3, evidence_mass: 4, signal_count: 2 },
      ],
      signal_counts: { fear_expression: 2, leadership_visible_presence: 1 },
      source_type_mass: { news: 2, radio: 1 },
    },
    {
      date: '2026-05-02', scope: 'national',
      total_articles_analyzed: 14,
      overall_score: 7,
      components: [
        { component_id: 'narrative', score: 8, confidence: 'high', certainty: 0.82, polarization: 0.05, evidence_mass: 10, signal_count: 6 },
        { component_id: 'leadership', score: 6, confidence: 'high', certainty: 0.86, polarization: 0.2, evidence_mass: 6, signal_count: 3 },
      ],
      signal_counts: { fear_expression: 3, calm_confidence: 1 },
      source_type_mass: { news: 3, field: 1 },
    },
  ];
}

describe('driftService.compute', () => {
  it('returns per-component series for every COMPONENT_ID, even when missing in some days', () => {
    const fakeHistory = buildHistory();
    const svc = createDriftService({
      historyReader: () => fakeHistory,
    });
    const result = svc.compute({ scope: 'national', days: 30 });

    assert.equal(result.scope, 'national');
    assert.deepEqual(result.dates, ['2026-05-01', '2026-05-02']);
    for (const id of COMPONENT_IDS) {
      assert.ok(result.per_component[id], `missing per_component.${id}`);
      assert.equal(result.per_component[id].series.length, 2,
        `${id} series should have one point per date`);
    }
    assert.equal(result.per_component.narrative.series[0].score, 7);
    assert.equal(result.per_component.narrative.series[1].score, 8);
    assert.equal(result.per_component.functional_continuity.series[0].score, null,
      'components with no data on a date should still appear with score=null');
  });

  it('builds overall_series', () => {
    const svc = createDriftService({ historyReader: () => buildHistory() });
    const result = svc.compute({ scope: 'national', days: 30 });
    assert.deepEqual(result.overall_series, [
      { date: '2026-05-01', score: 6 },
      { date: '2026-05-02', score: 7 },
    ]);
  });

  it('aggregates signal_volume_per_day with per-type counts and totals', () => {
    const svc = createDriftService({ historyReader: () => buildHistory() });
    const result = svc.compute({ scope: 'national', days: 30 });
    assert.equal(result.signal_volume_per_day.length, 2);
    assert.equal(result.signal_volume_per_day[0].total, 3);
    assert.equal(result.signal_volume_per_day[0].by_type.fear_expression, 2);
    assert.equal(result.signal_volume_per_day[1].total, 4);
    assert.equal(result.signal_volume_per_day[1].by_type.calm_confidence, 1);
  });

  it('builds source_share_per_day', () => {
    const svc = createDriftService({ historyReader: () => buildHistory() });
    const result = svc.compute({ scope: 'national', days: 30 });
    assert.equal(result.source_share_per_day[0].total, 3);
    assert.equal(result.source_share_per_day[0].by_source_type.news, 2);
    assert.equal(result.source_share_per_day[1].by_source_type.field, 1);
  });

  it('counts overrides per day and computes rate', () => {
    const fakeHistory = buildHistory();
    const overridesService = {
      countByComponent: ({ date }) => {
        if (date === '2026-05-01') return { narrative: 1 };
        if (date === '2026-05-02') return { narrative: 2, leadership: 1 };
        return {};
      },
    };
    const svc = createDriftService({
      historyReader: () => fakeHistory,
      overridesService,
    });
    const result = svc.compute({ scope: 'national', days: 30 });

    assert.equal(result.overrides.total, 4);
    assert.equal(result.overrides.by_component.narrative, 3);
    assert.equal(result.overrides.by_component.leadership, 1);
    assert.equal(result.overrides.per_day[0].count, 1);
    assert.equal(result.overrides.per_day[1].count, 3);
    // rate = 4 overrides / 4 components-with-data (2 per day × 2 days) = 1.0
    assert.equal(result.overrides.rate, 1.0);
  });

  it('produces zero overrides when no overridesService is provided', () => {
    const svc = createDriftService({ historyReader: () => buildHistory() });
    const result = svc.compute({ scope: 'national', days: 30 });
    assert.equal(result.overrides.total, 0);
    assert.equal(result.overrides.rate, 0);
    assert.deepEqual(result.overrides.per_day.map((d) => d.count), [0, 0]);
  });

  it('includes daily mean polarization and certainty series', () => {
    const svc = createDriftService({ historyReader: () => buildHistory() });
    const result = svc.compute({ scope: 'national', days: 30 });
    assert.equal(result.daily_mean_polarization.length, 2);
    assert.ok(typeof result.daily_mean_polarization[0].mean === 'number');
    assert.equal(result.daily_mean_certainty.length, 2);
    assert.ok(typeof result.daily_mean_certainty[0].mean === 'number');
    assert.ok(result.per_component.narrative.series[0].certainty != null);
  });

  it('emits alerts when override rate and 3-day polarization mean exceed thresholds', () => {
    const fakeHistory = [
      {
        date: '2026-04-29', scope: 'national',
        total_articles_analyzed: 12, overall_score: 6,
        components: [
          { component_id: 'narrative', score: 7, confidence: 'high', certainty: 0.5, polarization: 0.75, evidence_mass: 8, signal_count: 5 },
        ],
        signal_counts: { fear_expression: 2 }, source_type_mass: { news: 2 },
      },
      {
        date: '2026-04-30', scope: 'national',
        total_articles_analyzed: 12, overall_score: 6,
        components: [
          { component_id: 'narrative', score: 7, confidence: 'high', certainty: 0.5, polarization: 0.78, evidence_mass: 8, signal_count: 5 },
        ],
        signal_counts: { fear_expression: 2 }, source_type_mass: { news: 2 },
      },
      {
        date: '2026-05-01', scope: 'national',
        total_articles_analyzed: 12, overall_score: 6,
        components: [
          { component_id: 'narrative', score: 7, confidence: 'high', certainty: 0.5, polarization: 0.74, evidence_mass: 8, signal_count: 5 },
        ],
        signal_counts: { fear_expression: 2 }, source_type_mass: { news: 2 },
      },
    ];
    const overridesService = {
      countByComponent: () => ({ narrative: 5 }),
    };
    const prevO = process.env.RESILIENCE_DRIFT_ALERT_OVERRIDE_RATE;
    const prevP = process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION;
    process.env.RESILIENCE_DRIFT_ALERT_OVERRIDE_RATE = '0.1';
    process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION = '0.7';
    try {
      const svc = createDriftService({ historyReader: () => fakeHistory, overridesService });
      const result = svc.compute({ scope: 'national', days: 30 });
      const codes = result.alerts.map((a) => a.code);
      assert.ok(codes.includes('high_override_rate'));
      const polAlert = result.alerts.find((a) => a.code === 'high_mean_polarization');
      assert.ok(polAlert);
      assert.equal(polAlert.polarization_window_days, 3);
    } finally {
      if (prevO === undefined) delete process.env.RESILIENCE_DRIFT_ALERT_OVERRIDE_RATE;
      else process.env.RESILIENCE_DRIFT_ALERT_OVERRIDE_RATE = prevO;
      if (prevP === undefined) delete process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION;
      else process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION = prevP;
    }
  });

  it('does NOT alert when one bad day is offset by two calm days in the window', () => {
    const fakeHistory = [
      {
        date: '2026-04-29', scope: 'national',
        total_articles_analyzed: 12, overall_score: 6,
        components: [
          { component_id: 'narrative', score: 7, confidence: 'high', certainty: 0.5, polarization: 0.20, evidence_mass: 8, signal_count: 5 },
        ],
        signal_counts: { fear_expression: 1 }, source_type_mass: { news: 1 },
      },
      {
        date: '2026-04-30', scope: 'national',
        total_articles_analyzed: 12, overall_score: 6,
        components: [
          { component_id: 'narrative', score: 7, confidence: 'high', certainty: 0.5, polarization: 0.30, evidence_mass: 8, signal_count: 5 },
        ],
        signal_counts: { fear_expression: 1 }, source_type_mass: { news: 1 },
      },
      {
        date: '2026-05-01', scope: 'national',
        total_articles_analyzed: 12, overall_score: 6,
        components: [
          { component_id: 'narrative', score: 7, confidence: 'high', certainty: 0.5, polarization: 0.95, evidence_mass: 8, signal_count: 5 },
        ],
        signal_counts: { fear_expression: 1 }, source_type_mass: { news: 1 },
      },
    ];
    const prevP = process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION;
    process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION = '0.7';
    try {
      const svc = createDriftService({ historyReader: () => fakeHistory });
      const result = svc.compute({ scope: 'national', days: 30 });
      const polAlert = result.alerts.find((a) => a.code === 'high_mean_polarization');
      assert.equal(polAlert, undefined,
        'mean(0.20, 0.30, 0.95) ~ 0.483 must not exceed 0.7 threshold');
    } finally {
      if (prevP === undefined) delete process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION;
      else process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION = prevP;
    }
  });

  it('respects RESILIENCE_DRIFT_POLARIZATION_WINDOW', () => {
    const fakeHistory = [
      {
        date: '2026-05-01', scope: 'national',
        total_articles_analyzed: 12, overall_score: 6,
        components: [
          { component_id: 'narrative', score: 7, confidence: 'high', certainty: 0.5, polarization: 0.95, evidence_mass: 8, signal_count: 5 },
        ],
        signal_counts: {}, source_type_mass: {},
      },
    ];
    const prevP = process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION;
    const prevW = process.env.RESILIENCE_DRIFT_POLARIZATION_WINDOW;
    process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION = '0.7';
    process.env.RESILIENCE_DRIFT_POLARIZATION_WINDOW = '1';
    try {
      const svc = createDriftService({ historyReader: () => fakeHistory });
      const result = svc.compute({ scope: 'national', days: 30 });
      const polAlert = result.alerts.find((a) => a.code === 'high_mean_polarization');
      assert.ok(polAlert, 'expected window=1 alert');
      assert.equal(polAlert.polarization_window_days, 1);
    } finally {
      if (prevP === undefined) delete process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION;
      else process.env.RESILIENCE_DRIFT_ALERT_POLARIZATION = prevP;
      if (prevW === undefined) delete process.env.RESILIENCE_DRIFT_POLARIZATION_WINDOW;
      else process.env.RESILIENCE_DRIFT_POLARIZATION_WINDOW = prevW;
    }
  });
});
