import assert from 'node:assert/strict';
import test from 'node:test';
import { createPboRegionalDailyService } from '../../../../business_modules/pbo_report_regional/app/pboRegionalDailyService.js';

test('regional PBO service delegates markdown report listing by region', () => {
  const calls = [];
  const service = createPboRegionalDailyService({
    repository: {
      listReports(args) {
        calls.push(args);
        return [{ file: 'naftali-2026-05-03.md' }];
      },
    },
  });

  const dashboard = service.getRegionalPboReportDays('Naftali');

  assert.equal(dashboard.regionId, 'naftali');
  assert.equal(dashboard.inboxRelative, 'business_modules/pbo_report_regional/data');
  assert.deepEqual(dashboard.days, [{ file: 'naftali-2026-05-03.md' }]);
  assert.deepEqual(calls, [{ regionId: 'naftali' }]);
});

test('regional PBO service rejects unknown regions', () => {
  const service = createPboRegionalDailyService({
    repository: {
      listReports() {
        return [];
      },
    },
  });

  assert.throws(
    () => service.getRegionalPboReportDays('district'),
    (err) => err.code === 'UNKNOWN_REGION',
  );
});
