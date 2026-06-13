import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { naftaliWeekToExtractUnits } from '../../../../business_modules/pool/app/naftaliDashboardToExtractUnits.js';

describe('naftaliWeekToExtractUnits', () => {
  it('builds units from severity and free-text fields', () => {
    const units = naftaliWeekToExtractUnits({
      responses: [{
        municipality: 'Kiryat Shmona',
        severity: { financialRequests: 'high' },
        vulnerable: { singleParent: 3 },
        freeText: { mainChallenge: 'Staff burnout in welfare services' },
      }],
    });
    assert.equal(units.length, 1);
    assert.ok(units[0].body.includes('Kiryat Shmona'));
    assert.ok(units[0].body.includes('Staff burnout'));
  });
});
