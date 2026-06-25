import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveDateWindow,
  buildComponentTimeline,
  formatComponentTimeline,
} from '../../../../business_modules/chat/domain/traceComponentTimeline.js';
import { formatAnalysisDateTime } from '../../../../utils/dateUtils.js';

const mockMunicipalityDashboard = () => ({
  municipalities: ['Testville'],
  days: [{
    date: '2026-03-21',
    municipalities: [{
      name: 'Testville',
      components: {
        information_communication: { avg: 0.75, texts: ['local comms strong'], scores: [] },
      },
    }],
  }],
});

describe('traceComponentTimeline', () => {
  it('resolveDateWindow filters inclusive bounds', () => {
    const dates = resolveDateWindow('2026-03-21', '2026-03-25', false);
    for (const d of dates) {
      assert.ok(d >= '2026-03-21' && d <= '2026-03-25');
    }
  });

  it('resolveDateWindow returns explicit range when no report dates match', () => {
    const dates = resolveDateWindow('2099-01-01', '2099-01-03', false);
    assert.deepEqual(dates, ['2099-01-01', '2099-01-02', '2099-01-03']);
  });

  it('buildComponentTimeline returns rows for mock dashboard', async () => {
    const result = await buildComponentTimeline(
      { component: 'information_communication', municipality: 'Testville', date_from: '2026-03-21', date_to: '2026-03-21' },
      { getMunicipalityDashboard: mockMunicipalityDashboard, includeScores: false },
    );

    assert.equal(result.component, 'information_communication');
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].pbo_avg, '0.75');
    const text = formatComponentTimeline(result);
    assert.match(text, /TIMELINE:/);
    assert.match(text, /Testville|information_communication/);
  });

  it('formatComponentTimeline includes analyzed_at with time when present', () => {
    const text = formatComponentTimeline({
      component: 'leadership',
      municipality: null,
      date_from: '2026-03-21',
      date_to: '2026-03-21',
      date_count: 1,
      rows: [{
        date: '2026-03-21',
        analyzed_at: '2026-03-21T11:45:00.000Z',
        analyzed_at_label: formatAnalysisDateTime('2026-03-21T11:45:00.000Z'),
        instrument: 'high/sufficient',
        pbo_avg: '—',
        signal_count: 0,
        signal_excerpts: [],
        narrative_excerpt: 'test',
        pbo_text: '—',
      }],
      gaps: [],
    });
    assert.match(text, /analyzed_at/);
    assert.match(text, /2026-03-21 \d{2}:\d{2}/);
  });
});
