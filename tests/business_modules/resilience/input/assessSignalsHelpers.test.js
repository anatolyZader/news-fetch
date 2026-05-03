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
} from '../../../../business_modules/resilience/input/assessSignalsHelpers.js';

describe('crossSourceDedup', () => {
  it('collapses identical evidence republished by multiple outlets', () => {
    const sigs = [
      { signal_type: 'compliance_enter_shelter', evidence: 'residents went to shelter', article_source: 'ynet', temporal_weight: 1.0, evidence_type: 'observational_reported_fact' },
      { signal_type: 'compliance_enter_shelter', evidence: 'Residents went to shelter.', article_source: 'maariv', temporal_weight: 0.85, evidence_type: 'observational_reported_fact' },
      { signal_type: 'compliance_enter_shelter', evidence: 'Different evidence here', article_source: 'kan', temporal_weight: 0.7, evidence_type: 'observational_reported_fact' },
    ];
    const out = crossSourceDedup(sigs);
    assert.equal(out.length, 2);
    // Highest temporal_weight should survive
    const collapsed = out.find((s) => s.evidence?.toLowerCase().startsWith('residents'));
    assert.equal(collapsed.article_source, 'ynet');
  });

  it('does not collapse different signal_types even with same evidence', () => {
    const sigs = [
      { signal_type: 'service_continuity', evidence: 'same wording', article_source: 'a', temporal_weight: 1.0, evidence_type: 'observational_reported_fact' },
      { signal_type: 'service_disruption', evidence: 'same wording', article_source: 'b', temporal_weight: 1.0, evidence_type: 'observational_reported_fact' },
    ];
    assert.equal(crossSourceDedup(sigs).length, 2);
  });

  it('keeps higher reliability when temporal_weights tie', () => {
    const sigs = [
      { signal_type: 'leadership_clear_guidance', evidence: 'mayor announced shelter hours', article_source: 'ynet', temporal_weight: 0.85, evidence_type: 'observational_reported_fact' },
      { signal_type: 'leadership_clear_guidance', evidence: 'Mayor announced shelter hours.', article_source: 'kan',  temporal_weight: 0.85, evidence_type: 'direct_quote_named_person' },
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
    assert.equal(ewmaScore(10, 0, 2.0), 10);
    assert.equal(ewmaScore(10, 0, -1.0), 0);
  });
});

describe('deltaSignificance', () => {
  it('returns null with fewer than 2 history points', () => {
    assert.equal(deltaSignificance(7, []), null);
    assert.equal(deltaSignificance(7, [5]), null);
  });

  it('returns null when history is degenerate (zero variance)', () => {
    assert.equal(deltaSignificance(7, [5, 5, 5]), null);
  });

  it('computes z-score correctly for a known series', () => {
    // history: 4,5,6,5,4,5,6 → mean=5, sd≈0.816 (n-1)
    const z = deltaSignificance(7, [4, 5, 6, 5, 4, 5, 6]);
    assert.ok(z !== null);
    assert.ok(z > 2.0 && z < 3.0, `expected z roughly 2.4, got ${z}`);
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
    const file = `resilience-report-${date}-${time}.json`;
    writeFileSync(join(dir, file), JSON.stringify({ assessment: { date, components } }), 'utf8');
  }

  it('returns empty when reports directory is missing', () => {
    const out = loadHistoricalScores('2026-05-03', resolve(dir, 'nonexistent'), 14);
    assert.deepEqual(out, {});
  });

  it('loads scores for the trailing N days, most-recent-first', () => {
    writeReport('2026-05-02', [{ component_id: 'narrative', score: 6 }]);
    writeReport('2026-05-01', [{ component_id: 'narrative', score: 5 }]);
    writeReport('2026-04-30', [{ component_id: 'narrative', score: 4 }]);
    const out = loadHistoricalScores('2026-05-03', dir, 14);
    assert.deepEqual(out.narrative, [6, 5, 4]);
  });

  it('skips insufficient_data days (score is null)', () => {
    writeReport('2026-05-02', [{ component_id: 'narrative', score: null }]);
    writeReport('2026-05-01', [{ component_id: 'narrative', score: 5 }]);
    const out = loadHistoricalScores('2026-05-03', dir, 14);
    assert.deepEqual(out.narrative, [5]);
  });

  it('does not include the targetDate itself', () => {
    writeReport('2026-05-03', [{ component_id: 'narrative', score: 9 }]);
    writeReport('2026-05-02', [{ component_id: 'narrative', score: 6 }]);
    const out = loadHistoricalScores('2026-05-03', dir, 14);
    assert.deepEqual(out.narrative, [6]);
  });

  it('picks the latest run when multiple times exist for one date', () => {
    writeReport('2026-05-02', [{ component_id: 'narrative', score: 4 }], '0830');
    writeReport('2026-05-02', [{ component_id: 'narrative', score: 8 }], '1900');
    const out = loadHistoricalScores('2026-05-03', dir, 14);
    assert.deepEqual(out.narrative, [8]);
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
