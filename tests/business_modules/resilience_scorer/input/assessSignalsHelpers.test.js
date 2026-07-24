import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';

import {
  crossSourceDedup,
  mergeLoadedSignalFiles,
  parseSignalBundleFilename,
  discoverSignalBundles,
  loadAssessSignalFiles,
} from '../../../../business_modules/resilience_scorer/app/assessment/assessSignalsHelpers.js';
import { loadHistoricalScores } from '../../../../business_modules/resilience_scorer/infrastructure/reportHistoryReader.js';

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
      { signal_type: 'compliance_enter_shelter', source_type: 'visits', evidence: 'Residents entered shelters.', article_source: 'field-team-2', temporal_weight: 1, evidence_type: 'observational_reported_fact' },
    ];
    const out = crossSourceDedup(sigs);
    assert.equal(out.length, 2, 'press quote and field observation must both survive');
    const types = new Set(out.map((s) => s.source_type));
    assert.ok(types.has('news') && types.has('visits'));
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

  it('excludes non-normal (field_anchor_only / abstained) days from the series', () => {
    const file = 'resilience-report-data-2026-05-02-run-0830.json';
    writeFileSync(join(dir, file), JSON.stringify({
      assessment: {
        date: '2026-05-02',
        assessment_mode: 'field_anchor_only',
        components: [{ component_id: 'narrative', score: 7 }],
      },
    }), 'utf8');
    writeReport('2026-05-01', [{ component_id: 'narrative', score: 5 }]);
    const out = loadHistoricalScores('2026-05-03', dir, 14);
    assert.equal(out.narrative[0], null,
      'field_anchor_only day must not seed the smoothing/delta baseline');
    assert.equal(out.narrative[1], 5);
  });
});

describe('parseSignalBundleFilename', () => {
  it('parses standard and multi-district PBO bundle names', () => {
    assert.deepEqual(parseSignalBundleFilename('signals-news-2026-05-01.json'), {
      sourceType: 'news',
      fileDate: '2026-05-01',
      districtId: null,
    });
    assert.deepEqual(parseSignalBundleFilename('signals-visits-2026-05-01.json'), {
      sourceType: 'visits',
      fileDate: '2026-05-01',
      districtId: null,
    });
    assert.deepEqual(parseSignalBundleFilename('signals-field-2026-05-01.json'), {
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
          signals: [
            { evidence: 'Volunteers distributed supplies' },
            { evidence: 'Shelters were opened on alert', district_id: 'south' },
          ],
        },
      },
    ]);
    assert.equal(allSignals.length, 2);
    assert.equal(allSignals[0].district_id, 'south');
    assert.equal(allSignals[1].district_id, 'south');
  });

  it('re-applies field hygiene at load: strips avg blobs, drops contentless PBO rows, reports drops', () => {
    const { allSignals, hygieneDrops } = mergeLoadedSignalFiles([
      {
        weight: 1,
        sourceType: 'pbo',
        fileDate: '2026-04-01',
        fileDistrictId: 'north',
        data: {
          signals: [
            { signal_type: 'resilience_narrative_positive', evidence: '[אעבלין] נרטיב: avg=81% (100%, 75%) — מתמודדים ברובם' },
            { signal_type: 'community_volunteering', evidence: '[מגדל תפן] הון ומשאבי קהילה: avg=100% (100%, 100%) — לא רלוונטי' },
            { signal_type: 'community_volunteering', evidence: '[כרמיאל] הון ומשאבי קהילה: avg=100% (100%, 100%) — ללש' },
          ],
        },
      },
      {
        weight: 1,
        sourceType: 'news',
        fileDate: '2026-04-01',
        fileDistrictId: null,
        data: { signals: [{ signal_type: 'fear_expression', evidence: 'ok' }] },
      },
    ]);
    assert.equal(allSignals.length, 2);
    assert.equal(allSignals[0].evidence, '[אעבלין] מתמודדים ברובם');
    // News bundles are untouched by field hygiene (short evidence survives).
    assert.equal(allSignals[1].evidence, 'ok');
    assert.deepEqual(hygieneDrops, { total: 2, by_source: { pbo: 2 } });
  });
});

describe('discoverSignalBundles field history', () => {
  it('loads all field bundles on or before target date, not only the assess window', () => {
    const root = mkdtempSync(join(tmpdir(), 'field-hist-'));
    try {
      const signalsDir = join(root, 'business_modules/resilience_scorer/data/signals');
      const visitsSignalsDir = join(root, 'business_modules/visits/data/signals');
      const socialSignalsDir = join(root, 'business_modules/social_media/data');
      mkdirSync(signalsDir, { recursive: true });
      mkdirSync(visitsSignalsDir, { recursive: true });
      mkdirSync(socialSignalsDir, { recursive: true });

      const oldField = 'signals-visits-2026-05-01.json';
      const inWindowField = 'signals-visits-2026-06-10.json';
      const oldNews = 'signals-news-2026-05-01.json';
      writeFileSync(join(visitsSignalsDir, oldField), JSON.stringify({ signals: [{ evidence: 'old visit' }] }));
      writeFileSync(join(visitsSignalsDir, inWindowField), JSON.stringify({ signals: [{ evidence: 'recent visit' }] }));
      writeFileSync(join(signalsDir, oldNews), JSON.stringify({ signals: [{ evidence: 'old news' }] }));

      const targetDate = '2026-06-10';
      const days = 3;
      const discovery = discoverSignalBundles({
        targetDate,
        days,
        signalsDir,
        visitsSignalsDir,
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
    const visitsSignalsDir = join(root, 'field');
    const socialSignalsDir = join(root, 'social');
    mkdirSync(signalsDir, { recursive: true });
    mkdirSync(visitsSignalsDir, { recursive: true });
    mkdirSync(socialSignalsDir, { recursive: true });
    try {
      writeFileSync(
        join(visitsSignalsDir, 'signals-visits-1970-01-01.json'),
        JSON.stringify({ signals: [{ evidence: 'placeholder' }] }),
      );
      writeFileSync(
        join(visitsSignalsDir, 'signals-visits-2026-04-10.json'),
        JSON.stringify({ signals: [{ evidence: 'valid' }] }),
      );
      const targetDate = '2026-04-10';
      const discovery = discoverSignalBundles({
        targetDate,
        days: 1,
        signalsDir,
        visitsSignalsDir,
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
      assert.ok(!fieldFiles.includes('signals-visits-1970-01-01.json'));
      assert.ok(fieldFiles.includes('signals-visits-2026-04-10.json'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
