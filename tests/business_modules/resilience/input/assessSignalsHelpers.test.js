import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';

import {
  crossSourceDedup,
  loadHistoricalScores,
  ewmaScore,
  deltaSignificance,
  enrichWithDeltaChannel,
  mergeLoadedSignalFiles,
  parseSignalBundleFilename,
  discoverSignalBundles,
  loadAssessSignalFiles,
} from '../../../../business_modules/resilience/app/assessSignalsHelpers.js';

describe('crossSourceDedup', () => {
  it('collapses identical evidence republished by multiple outlets within the same source_type', () => {
    const sigs = [
      { signal_type: 'compliance_enter_shelter', source_type: 'news', evidence: 'residents went to shelter', article_source: 'ynet', temporal_weight: 1, evidence_type: 'observational_reported_fact' },
      { signal_type: 'compliance_enter_shelter', source_type: 'news', evidence: 'Residents went to shelter.', article_source: 'maariv', temporal_weight: 0.85, evidence_type: 'observational_reported_fact' },
      { signal_type: 'compliance_enter_shelter', source_type: 'news', evidence: 'Different evidence here', article_source: 'kan', temporal_weight: 0.7, evidence_type: 'observational_reported_fact' },
    ];
    const out = crossSourceDedup(sigs);
    assert.equal(out.length, 2);
    // Highest temporal_weight should survive
    const collapsed = out.find((s) => s.evidence?.toLowerCase().startsWith('residents'));
    assert.equal(collapsed.article_source, 'ynet');
  });

  it('does NOT collapse identical evidence across different source_types (A4)', () => {
    const sigs = [
      { signal_type: 'compliance_enter_shelter', source_type: 'news', evidence: 'residents entered shelters', article_source: 'ynet', temporal_weight: 1, evidence_type: 'observational_reported_fact' },
      { signal_type: 'compliance_enter_shelter', source_type: 'field', evidence: 'Residents entered shelters.', article_source: 'field-team-2', temporal_weight: 1, evidence_type: 'observational_reported_fact' },
    ];
    const out = crossSourceDedup(sigs);
    assert.equal(out.length, 2, 'press quote and field observation must both survive');
    const types = new Set(out.map((s) => s.source_type));
    assert.ok(types.has('news') && types.has('field'));
  });

  it('does not collapse different signal_types even with same evidence', () => {
    const sigs = [
      { signal_type: 'service_continuity', source_type: 'news', evidence: 'same wording', article_source: 'a', temporal_weight: 1, evidence_type: 'observational_reported_fact' },
      { signal_type: 'service_disruption', source_type: 'news', evidence: 'same wording', article_source: 'b', temporal_weight: 1, evidence_type: 'observational_reported_fact' },
    ];
    assert.equal(crossSourceDedup(sigs).length, 2);
  });

  it('keeps higher reliability when temporal_weights tie', () => {
    const sigs = [
      { signal_type: 'leadership_clear_guidance', source_type: 'news', evidence: 'mayor announced shelter hours', article_source: 'ynet', temporal_weight: 0.85, evidence_type: 'observational_reported_fact' },
      { signal_type: 'leadership_clear_guidance', source_type: 'news', evidence: 'Mayor announced shelter hours.', article_source: 'kan',  temporal_weight: 0.85, evidence_type: 'direct_quote_named_person' },
    ];
    const out = crossSourceDedup(sigs);
    assert.equal(out.length, 1);
    assert.equal(out[0].evidence_type, 'direct_quote_named_person');
  });
});

describe('ewmaScore', () => {
  it('returns today when yesterday is null', () => {
    assert.equal(ewmaScore(7, null, 0.5), 7);
  });

  it('returns null when today is null', () => {
    assert.equal(ewmaScore(null, 5, 0.5), null);
  });

  it('weights today and yesterday by alpha (rounded)', () => {
    assert.equal(ewmaScore(8, 4, 0.5), 6);
    assert.equal(ewmaScore(8, 4, 0.25), 5);
    assert.equal(ewmaScore(8, 4, 0.75), 7);
  });

  it('clamps alpha into [0,1]', () => {
    assert.equal(ewmaScore(10, 0, 2), 10);
    assert.equal(ewmaScore(10, 0, -1), 0);
  });
});

describe('deltaSignificance', () => {
  it('A6: returns null with fewer than the min-history threshold (default 5) non-null points', () => {
    assert.equal(deltaSignificance(7, []), null);
    assert.equal(deltaSignificance(7, [5]), null);
    assert.equal(deltaSignificance(7, [5, 6, 5, 6]), null, '4 points still below default min-history');
  });

  it('A6: filters null entries when counting and when computing stats', () => {
    // 5 non-null points buried in calendar-aligned nulls — should still compute.
    const z = deltaSignificance(7, [null, 4, null, 5, 6, 5, 4, null, 5, 6, null, null]);
    assert.ok(z !== null);
  });

  it('returns null when history is degenerate (zero variance)', () => {
    assert.equal(deltaSignificance(7, [5, 5, 5, 5, 5, 5]), null);
  });

  it('computes z-score correctly for a known series', () => {
    // history: 4,5,6,5,4,5,6 → mean=5, sd≈0.816 (n-1)
    const z = deltaSignificance(7, [4, 5, 6, 5, 4, 5, 6]);
    assert.ok(z !== null);
    assert.ok(z > 2 && z < 3, `expected z roughly 2.4, got ${z}`);
  });
});

describe('enrichWithDeltaChannel', () => {
  it('adds smoothed score, delta_score, delta_significance, delta_flag', () => {
    const scored = {
      narrative: { score: 7, certainty: 0.6 },
      leadership: { score: 4, certainty: 0.4 },
    };
    const history = {
      narrative:  [5, 6, 5, 5, 4, 5, 6, 5, 5],
      leadership: [4, 4, 4, 5, 4, 4, 4, 4, 4],
    };
    const out = enrichWithDeltaChannel(scored, history);
    assert.ok(out.narrative.score_smoothed != null);
    assert.equal(out.narrative.delta_score, 7 - 5); // today minus yesterday[0]
    assert.ok(out.narrative.delta_significance != null);
    assert.equal(out.leadership.delta_score, 0);
  });

  it('flags significant changes when |z|>2', () => {
    const scored = { narrative: { score: 9, certainty: 0.8 } };
    // Tight history that makes today an outlier
    const history = { narrative: [5, 5, 6, 5, 5, 5, 6, 5, 5, 5] };
    const out = enrichWithDeltaChannel(scored, history);
    assert.equal(out.narrative.delta_flag, 'significant');
  });

  it('handles missing history (all nulls)', () => {
    const scored = { narrative: { score: 7, certainty: 0.5 } };
    const out = enrichWithDeltaChannel(scored, {});
    assert.equal(out.narrative.delta_score, null);
    assert.equal(out.narrative.delta_significance, null);
    assert.equal(out.narrative.delta_flag, null);
    assert.equal(out.narrative.score_smoothed, 7);
  });

  it('A6: yesterday=null in calendar-aligned series falls back to today for EWMA / delta', () => {
    const scored = { narrative: { score: 7, certainty: 0.5 } };
    // Calendar-aligned: yesterday is missing (null), but earlier days are present.
    const history = { narrative: [null, 6, 5, 5, 6, 5, 5, 6, 5, 5] };
    const out = enrichWithDeltaChannel(scored, history);
    assert.equal(out.narrative.delta_score, null, 'no yesterday → no delta');
    assert.equal(out.narrative.score_smoothed, 7, 'EWMA defaults to today when yesterday null');
    assert.ok(out.narrative.delta_significance != null,
      'significance still computed against >=5 non-null prior days in baseline');
  });

  it('freezeTemporal skips EWMA blend and delta fields', () => {
    const scored = { narrative: { score: 7, certainty: 0.8 } };
    const history = { narrative: [5, 5, 5, 5, 5, 5, 5, 5, 5] };
    const out = enrichWithDeltaChannel(scored, history, { freezeTemporal: true });
    assert.equal(out.narrative.score_smoothed, 7);
    assert.equal(out.narrative.delta_score, null);
    assert.equal(out.narrative.delta_significance, null);
    assert.equal(out.narrative.delta_flag, null);
  });

  it('preserves untouched fields on the component', () => {
    const scored = { narrative: { score: 7, certainty: 0.5, signals: [{ x: 1 }], polarization: 0.3 } };
    const out = enrichWithDeltaChannel(scored, {});
    assert.deepEqual(out.narrative.signals, [{ x: 1 }]);
    assert.equal(out.narrative.polarization, 0.3);
  });
});

describe('loadHistoricalScores', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'reports-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeReport(date, components, time = '0830') {
    const file = `resilience-report-data-${date}-run-${time}.json`;
    writeFileSync(join(dir, file), JSON.stringify({ assessment: { date, components } }), 'utf8');
  }

  it('returns empty when reports directory is missing', () => {
    const out = loadHistoricalScores('2026-05-03', resolve(dir, 'nonexistent'), 14);
    assert.deepEqual(out, {});
  });

  it('A6: returns calendar-aligned series of length=days with null for missing days', () => {
    writeReport('2026-05-02', [{ component_id: 'narrative', score: 6 }]);
    writeReport('2026-05-01', [{ component_id: 'narrative', score: 5 }]);
    writeReport('2026-04-30', [{ component_id: 'narrative', score: 4 }]);
    const out = loadHistoricalScores('2026-05-03', dir, 14);
    assert.equal(out.narrative.length, 14);
    assert.deepEqual(out.narrative.slice(0, 3), [6, 5, 4]);
    assert.ok(out.narrative.slice(3).every((v) => v === null),
      'positions older than the available reports must be null, not absent');
  });

  it('A6: insufficient_data day appears as null at its calendar position', () => {
    writeReport('2026-05-02', [{ component_id: 'narrative', score: null }]);
    writeReport('2026-05-01', [{ component_id: 'narrative', score: 5 }]);
    const out = loadHistoricalScores('2026-05-03', dir, 14);
    assert.equal(out.narrative.length, 14);
    assert.equal(out.narrative[0], null, 'yesterday (insufficient_data) should be null at index 0');
    assert.equal(out.narrative[1], 5, 'two days ago should still be at index 1');
  });

  it('A6: a calendar gap day between reports is filled with null', () => {
    writeReport('2026-05-02', [{ component_id: 'narrative', score: 6 }]);
    // skip 2026-05-01 entirely
    writeReport('2026-04-30', [{ component_id: 'narrative', score: 4 }]);
    const out = loadHistoricalScores('2026-05-03', dir, 14);
    assert.equal(out.narrative[0], 6);
    assert.equal(out.narrative[1], null, 'gap day must be null, not collapsed away');
    assert.equal(out.narrative[2], 4);
  });

  it('does not include the targetDate itself', () => {
    writeReport('2026-05-03', [{ component_id: 'narrative', score: 9 }]);
    writeReport('2026-05-02', [{ component_id: 'narrative', score: 6 }]);
    const out = loadHistoricalScores('2026-05-03', dir, 14);
    assert.equal(out.narrative[0], 6);
  });

  it('picks the latest run when multiple times exist for one date', () => {
    writeReport('2026-05-02', [{ component_id: 'narrative', score: 4 }], '0830');
    writeReport('2026-05-02', [{ component_id: 'narrative', score: 8 }], '1900');
    const out = loadHistoricalScores('2026-05-03', dir, 14);
    assert.equal(out.narrative[0], 8);
  });

  it('respects the days window', () => {
    for (let i = 1; i <= 20; i++) {
      const d = new Date('2026-05-03');
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      writeReport(dateStr, [{ component_id: 'narrative', score: i }]);
    }
    const out = loadHistoricalScores('2026-05-03', dir, 5);
    assert.equal(out.narrative.length, 5);
    assert.deepEqual(out.narrative, [1, 2, 3, 4, 5]);
  });
});

describe('parseSignalBundleFilename', () => {
  it('parses standard and multi-district PBO bundle names', () => {
    assert.deepEqual(parseSignalBundleFilename('signals-news-2026-05-01.json'), {
      sourceType: 'news',
      fileDate: '2026-05-01',
      districtId: null,
    });
    assert.deepEqual(parseSignalBundleFilename('signals-field-2026-05-01.json'), {
      sourceType: 'visits',
      fileDate: '2026-05-01',
      districtId: null,
    });
    assert.deepEqual(parseSignalBundleFilename('signals-visits-2026-05-01.json'), {
      sourceType: 'visits',
      fileDate: '2026-05-01',
      districtId: null,
    });
    assert.deepEqual(parseSignalBundleFilename('signals-pbo-2026-05-01.json'), {
      sourceType: 'pbo',
      fileDate: '2026-05-01',
      districtId: 'north',
    });
    assert.deepEqual(parseSignalBundleFilename('signals-pbo-south-2026-05-01.json'), {
      sourceType: 'pbo',
      fileDate: '2026-05-01',
      districtId: 'south',
    });
  });
});

describe('mergeLoadedSignalFiles', () => {
  it('applies per-visit temporal_weight from article_date', () => {
    const targetDate = '2026-06-10';
    const { allSignals } = mergeLoadedSignalFiles([
      {
        weight: 1,
        sourceType: 'visits',
        fileDate: '2026-06-10',
        fileDistrictId: 'north',
        data: {
          signals: [
            { evidence: 'recent', article_date: '2026-06-10' },
            { evidence: 'older', article_date: '2026-06-08' },
          ],
        },
      },
    ], { targetDate });
    assert.equal(allSignals[0].temporal_weight, 1);
    assert.equal(allSignals[1].temporal_weight, 0.7);
    assert.equal(allSignals[0].source_type, 'visits');
  });

  it('copies bundle district_id onto signals when missing', () => {
    const { allSignals } = mergeLoadedSignalFiles([
      {
        weight: 1,
        sourceType: 'pbo',
        fileDate: '2026-05-01',
        fileDistrictId: 'south',
        data: {
          district_id: 'south',
          signals: [{ evidence: 'a' }, { evidence: 'b', district_id: 'south' }],
        },
      },
    ]);
    assert.equal(allSignals.length, 2);
    assert.equal(allSignals[0].district_id, 'south');
    assert.equal(allSignals[1].district_id, 'south');
  });
});

describe('discoverSignalBundles field history', () => {
  it('loads all field bundles on or before target date, not only the assess window', () => {
    const root = mkdtempSync(join(tmpdir(), 'field-hist-'));
    try {
      const signalsDir = join(root, 'business_modules/signals_extraction/data/signals');
      const fieldSignalsDir = join(root, 'business_modules/visits/data/signals');
      const socialSignalsDir = join(root, 'business_modules/social_media/data');
      mkdirSync(signalsDir, { recursive: true });
      mkdirSync(fieldSignalsDir, { recursive: true });
      mkdirSync(socialSignalsDir, { recursive: true });

      const oldField = 'signals-field-2026-05-01.json';
      const inWindowField = 'signals-field-2026-06-10.json';
      const oldNews = 'signals-news-2026-05-01.json';
      writeFileSync(join(fieldSignalsDir, oldField), JSON.stringify({ signals: [{ evidence: 'old visit' }] }));
      writeFileSync(join(fieldSignalsDir, inWindowField), JSON.stringify({ signals: [{ evidence: 'recent visit' }] }));
      writeFileSync(join(signalsDir, oldNews), JSON.stringify({ signals: [{ evidence: 'old news' }] }));

      const targetDate = '2026-06-10';
      const days = 3;
      const discovery = discoverSignalBundles({
        targetDate,
        days,
        signalsDir,
        fieldSignalsDir,
        socialSignalsDir,
      });
      const loaded = loadAssessSignalFiles({
        ...discovery,
        targetDate,
        targetDates: discovery.targetDates,
        recencySources: discovery.recencySources,
        enabledSources: new Set(['news', 'visits']),
      });

      const fieldFiles = loaded.filter((f) => f.sourceType === 'visits').map((f) => f.file);
      const newsFiles = loaded.filter((f) => f.sourceType === 'news').map((f) => f.file);
      assert.ok(fieldFiles.includes(oldField));
      assert.ok(fieldFiles.includes(inWindowField));
      assert.equal(newsFiles.includes(oldNews), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips placeholder field bundle dates (1970-01-01)', () => {
    const root = join(tmpdir(), `assess-signals-${Date.now()}`);
    const signalsDir = join(root, 'signals');
    const fieldSignalsDir = join(root, 'field');
    const socialSignalsDir = join(root, 'social');
    mkdirSync(signalsDir, { recursive: true });
    mkdirSync(fieldSignalsDir, { recursive: true });
    mkdirSync(socialSignalsDir, { recursive: true });
    try {
      writeFileSync(
        join(fieldSignalsDir, 'signals-field-1970-01-01.json'),
        JSON.stringify({ signals: [{ evidence: 'placeholder' }] }),
      );
      writeFileSync(
        join(fieldSignalsDir, 'signals-field-2026-04-10.json'),
        JSON.stringify({ signals: [{ evidence: 'valid' }] }),
      );
      const targetDate = '2026-04-10';
      const discovery = discoverSignalBundles({
        targetDate,
        days: 1,
        signalsDir,
        fieldSignalsDir,
        socialSignalsDir,
      });
      const loaded = loadAssessSignalFiles({
        ...discovery,
        targetDate,
        targetDates: discovery.targetDates,
        recencySources: discovery.recencySources,
        enabledSources: new Set(['visits']),
      });
      const fieldFiles = loaded.filter((f) => f.sourceType === 'visits').map((f) => f.file);
      assert.ok(!fieldFiles.includes('signals-field-1970-01-01.json'));
      assert.ok(fieldFiles.includes('signals-field-2026-04-10.json'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
