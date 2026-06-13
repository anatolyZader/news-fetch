import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pboDashboardDayToExtractUnits } from '../../../../business_modules/pbo_report_muni/app/pboDashboardToExtractUnits.js';

describe('pboDashboardDayToExtractUnits', () => {
  it('builds units from municipality component text and scores', () => {
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
  });
});
