import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisitsService } from '../../../../business_modules/visits/app/visitsService.js';

test('visits service summarizes visit days and signal types', () => {
  const visitsRepository = {
    listVisitDays() {
      return [
        {
          date: '2026-03-24',
          file: 'articles-visits-reports-2026-03-24.md',
          visitCount: 1,
          signalCount: 2,
          municipalities: ['מטה אשר/איילון'],
          visits: [
            {
              id: 'v1',
              municipality: 'מטה אשר/איילון',
              visitDate: '2026-03-15',
              signals: [
                { signal_type: 'resource_shortage' },
                { signal_type: 'resource_shortage' },
              ],
            },
          ],
        },
      ];
    },
  };

  const dashboard = createVisitsService({ visitsRepository }).getDashboard();

  assert.equal(dashboard.summary.totalVisits, 1);
  assert.equal(dashboard.summary.totalSignals, 2);
  assert.equal(dashboard.summary.totalMunicipalities, 1);
  assert.deepEqual(dashboard.summary.dateRange, { from: '2026-03-15', to: '2026-03-15' });
  assert.deepEqual(dashboard.signalTypes, [{ type: 'resource_shortage', count: 2 }]);
});
