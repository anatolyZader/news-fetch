import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  readResilienceHistory,
  certaintyNumericFromComponent,
} from '../../../../business_modules/resilience_scorer/infrastructure/reportHistoryReader.js';

let tmp;

beforeEach(() => {
  tmp = mkdtempSync(resolve(tmpdir(), 'history-reader-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeReport(dir, filename, payload) {
  writeFileSync(resolve(dir, filename), JSON.stringify(payload), 'utf8');
}

function reportFilename(date, runId = '1000', scope = 'national') {
  const prefix = scope === 'north' ? 'resilience-report-north' : 'resilience-report';
  return `${prefix}-data-${date}-run-${runId}.json`;
}

function buildReport({ date, totalArticles = 10, overall = 6, components = [], signals = [] }) {
  return {
    assessment: {
      date,
      total_articles_analyzed: totalArticles,
      overall_resilience_score: overall,
      components,
    },
    signals,
  };
}

describe('readResilienceHistory', () => {
  it('returns empty array when reportsDir does not exist', () => {
    const result = readResilienceHistory({ reportsDir: resolve(tmp, 'nope'), days: 30, endDate: '2026-05-03' });
    assert.deepEqual(result, []);
  });

  it('reads a single national report and summarizes components + signals', () => {
    writeReport(tmp, reportFilename('2026-05-01'), buildReport({
      date: '2026-05-01',
      totalArticles: 12,
      overall: 7,
      components: [
        { component_id: 'narrative', score: 8, confidence: 'high', certainty: 0.77, polarization: 0.1, evidence_mass: 12, signal_count: 5 },
        { component_id: 'leadership', score: 5, confidence: 'medium', polarization: 0.3, evidence_mass: 4, signal_count: 2 },
      ],
      signals: [
        { signal_type: 'fear_expression', source_type: 'news' },
        { signal_type: 'fear_expression', source_type: 'radio' },
        { signal_type: 'leadership_visible_presence', source_type: 'news' },
      ],
    }));

    const result = readResilienceHistory({ reportsDir: tmp, days: 7, endDate: '2026-05-03' });
    assert.equal(result.length, 1);
    const r = result[0];
    assert.equal(r.date, '2026-05-01');
    assert.equal(r.scope, 'national');
    assert.equal(r.total_articles_analyzed, 12);
    assert.equal(r.overall_score, 7);
    assert.equal(r.components.length, 2);
    assert.equal(r.signal_counts.fear_expression, 2);
    assert.equal(r.signal_counts.leadership_visible_presence, 1);
    assert.equal(r.source_type_mass.news, 2);
    assert.equal(r.source_type_mass.radio, 1);
    assert.equal(r.components[0].certainty, 0.77);
    assert.equal(r.components[1].certainty, 0.55);
  });

  it('certaintyNumericFromComponent prefers float then bucket proxy', () => {
    assert.equal(certaintyNumericFromComponent({ certainty: 0.42 }), 0.42);
    assert.equal(certaintyNumericFromComponent({ confidence: 'high' }), 0.85);
    assert.equal(certaintyNumericFromComponent({ confidence: 'insufficient_data' }), null);
  });

  it('picks canonical report per date by total_articles_analyzed (then mtime)', () => {
    writeReport(tmp, reportFilename('2026-05-01', '0700'), buildReport({
      date: '2026-05-01', totalArticles: 5, overall: 3,
    }));
    // The 30-article run is canonical even though it's earlier in alphabetical order
    writeReport(tmp, reportFilename('2026-05-01', '1900'), buildReport({
      date: '2026-05-01', totalArticles: 30, overall: 8,
    }));

    const result = readResilienceHistory({ reportsDir: tmp, days: 7, endDate: '2026-05-03' });
    assert.equal(result.length, 1);
    assert.equal(result[0].overall_score, 8, 'should pick the run with more articles');
    assert.equal(result[0].total_articles_analyzed, 30);
  });

  it('respects scope=north and excludes national reports', () => {
    writeReport(tmp, reportFilename('2026-05-01'), buildReport({
      date: '2026-05-01', totalArticles: 12, overall: 7,
    }));
    writeReport(tmp, reportFilename('2026-05-01', '1000', 'north'), buildReport({
      date: '2026-05-01', totalArticles: 5, overall: 4,
    }));

    const national = readResilienceHistory({ reportsDir: tmp, days: 7, endDate: '2026-05-03', scope: 'national' });
    const north    = readResilienceHistory({ reportsDir: tmp, days: 7, endDate: '2026-05-03', scope: 'north' });
    assert.equal(national.length, 1);
    assert.equal(national[0].overall_score, 7);
    assert.equal(north.length, 1);
    assert.equal(north[0].overall_score, 4);
    assert.equal(north[0].scope, 'north');
  });

  it('excludes -north- files from national results', () => {
    writeReport(tmp, reportFilename('2026-05-01', '1000', 'north'), buildReport({
      date: '2026-05-01', totalArticles: 5, overall: 4,
    }));
    const national = readResilienceHistory({ reportsDir: tmp, days: 7, endDate: '2026-05-03', scope: 'national' });
    assert.equal(national.length, 0, 'national scope should not pick up north files');
  });

  it('skips dates outside the window', () => {
    writeReport(tmp, reportFilename('2026-04-01'), buildReport({ date: '2026-04-01', overall: 2 }));
    writeReport(tmp, reportFilename('2026-05-01'), buildReport({ date: '2026-05-01', overall: 7 }));
    const result = readResilienceHistory({ reportsDir: tmp, days: 5, endDate: '2026-05-03' });
    assert.equal(result.length, 1, 'only 2026-05-01 falls in last 5 days');
    assert.equal(result[0].date, '2026-05-01');
  });

  it('returns chronologically-sorted records', () => {
    writeReport(tmp, reportFilename('2026-05-03'), buildReport({ date: '2026-05-03', overall: 7 }));
    writeReport(tmp, reportFilename('2026-05-01'), buildReport({ date: '2026-05-01', overall: 5 }));
    writeReport(tmp, reportFilename('2026-05-02'), buildReport({ date: '2026-05-02', overall: 6 }));
    const result = readResilienceHistory({ reportsDir: tmp, days: 7, endDate: '2026-05-03' });
    assert.deepEqual(result.map((r) => r.date), ['2026-05-01', '2026-05-02', '2026-05-03']);
  });

  it('skips malformed JSON files gracefully', () => {
    writeFileSync(resolve(tmp, reportFilename('2026-05-01')), 'not-json{', 'utf8');
    writeReport(tmp, reportFilename('2026-05-02'), buildReport({ date: '2026-05-02', overall: 6 }));
    const result = readResilienceHistory({ reportsDir: tmp, days: 7, endDate: '2026-05-03' });
    assert.equal(result.length, 1);
    assert.equal(result[0].date, '2026-05-02');
  });
});
