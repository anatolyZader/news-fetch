import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pboDashboardDayToExtractUnits } from '../../../../business_modules/pbo_report/app/pboDashboardToExtractUnits.js';

describe('pboDashboardDayToExtractUnits', () => {
  it('builds units from verbal text without scores', () => {
    const day = {
      date: '2026-04-03',
      file: 'pbo.xlsx',
      municipalities: [{
        name: 'TestCity',
        components: {
          narrative: {
            avg: 0.6,
            scores: [{ value: 0.6 }],
            texts: ['Residents show resilience narrative'],
          },
        },
      }],
    };
    const units = pboDashboardDayToExtractUnits(day, { he: { narrative: 'Narrative' } });
    assert.equal(units.length, 1);
    assert.ok(units[0].body.includes('TestCity'));
    assert.ok(units[0].body.includes('Residents show resilience narrative'));
    assert.ok(!units[0].body.includes('avg='));
    assert.ok(!units[0].body.includes('%'));
  });

  it('omits score-only components from extract units', () => {
    const day = {
      date: '2026-04-03',
      file: 'pbo.xlsx',
      municipalities: [{
        name: 'ScoreOnlyCity',
        components: {
          narrative: {
            avg: 0.8,
            scores: [{ value: 0.8 }, { value: 0.75 }],
            texts: [],
          },
        },
      }],
    };
    const units = pboDashboardDayToExtractUnits(day, { he: { narrative: 'Narrative' } });
    assert.equal(units.length, 0);
  });

  it('includes review supplemental text without verbal column text', () => {
    const reviewMeta = new Map([
      ['FollowUpCity', { supplementalTexts: { leadership: 'Officer clarified shelter access.' } }],
    ]);
    const day = {
      date: '2026-04-03',
      file: 'pbo.xlsx',
      municipalities: [{
        name: 'FollowUpCity',
        components: {
          leadership: { avg: 0.5, scores: [{ value: 0.5 }], texts: [] },
        },
      }],
    };
    const units = pboDashboardDayToExtractUnits(day, { he: { leadership: 'Leadership' } }, reviewMeta);
    assert.equal(units.length, 1);
    assert.ok(units[0].body.includes('[PBO follow-up leadership]'));
    assert.ok(units[0].body.includes('Officer clarified shelter access.'));
    assert.ok(!units[0].body.includes('avg='));
  });
});
