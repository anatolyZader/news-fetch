import assert from 'node:assert/strict';
import test from 'node:test';
import { createPboRegionalDailyService } from '../../../../business_modules/pbo_report_regional/app/pboRegionalDailyService.js';

const ROOT = '/repo';

test('regional PBO service delegates markdown report listing by district and region', () => {
  const calls = [];
  const service = createPboRegionalDailyService({
    rootDir: ROOT,
    repository: {
      listReports(args) {
        calls.push(args);
        return [{ file: 'naftali-2026-05-03.md' }];
      },
    },
  });

  const dashboard = service.getRegionalPboReportDays('north', 'Naftali');

  assert.equal(dashboard.districtId, 'north');
  assert.equal(dashboard.regionId, 'naftali');
  assert.match(dashboard.inboxRelative, /pbo_report_regional\/data/);
  assert.deepEqual(dashboard.days, [{ file: 'naftali-2026-05-03.md' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].regionId, 'naftali');
  assert.equal(calls[0].districtId, 'north');
});

test('regional PBO service rejects unknown regions for district', () => {
  const service = createPboRegionalDailyService({
    rootDir: ROOT,
    repository: { listReports() { return []; } },
  });

  assert.throws(
    () => service.getRegionalPboReportDays('south', 'naftali'),
    (err) => err.code === 'UNKNOWN_REGION',
  );
});

test('listPboDistricts returns registry summary', () => {
  const service = createPboRegionalDailyService({
    rootDir: process.cwd(),
    repository: { listReports() { return []; } },
  });
  const payload = service.listPboDistricts();
  assert.ok(Array.isArray(payload.districts));
  assert.ok(payload.districts.some((d) => d.id === 'north'));
});
