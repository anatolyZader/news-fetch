import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canOperatorAccessDistrict,
  operatorDistrictAccessForApi,
  resetOperatorDistrictAccessCache,
  resolveOperatorDistrictAccess,
  setOperatorDistrictAccessConfigForTests,
} from '../../../cross-cut-modules/auth/operatorDistrictAccess.js';

test.afterEach(() => {
  resetOperatorDistrictAccessCache();
});

test('when enforcement is disabled all districts are allowed', () => {
  resetOperatorDistrictAccessCache();
  setOperatorDistrictAccessConfigForTests({ operatorDistrictEnforcementEnabled: false, users: [] });
  const access = resolveOperatorDistrictAccess('anyone@example.com');
  assert.equal(access.unrestricted, true);
  assert.equal(canOperatorAccessDistrict('anyone@example.com', 'south'), true);
});

test('unregistered operator gets national only when enforcement is on', () => {
  resetOperatorDistrictAccessCache();
  setOperatorDistrictAccessConfigForTests({
    operatorDistrictEnforcementEnabled: true,
    users: [{ email: 'north@example.com', level: 'operator', districtIds: ['north'] }],
  });
  const access = resolveOperatorDistrictAccess('unknown@example.com');
  assert.equal(access.enforcementEnabled, true);
  assert.equal(access.unrestricted, false);
  assert.deepEqual(access.districtIds, []);
  assert.deepEqual(access.allowedReportScopes, ['national']);
  assert.equal(canOperatorAccessDistrict('unknown@example.com', 'national'), true);
  assert.equal(canOperatorAccessDistrict('unknown@example.com', 'north'), false);
});

test('registered operator is limited to assigned districts', () => {
  resetOperatorDistrictAccessCache();
  setOperatorDistrictAccessConfigForTests({
    operatorDistrictEnforcementEnabled: true,
    users: [{ email: 'multi@example.com', level: 'operator', districtIds: ['north', 'south'] }],
  });
  assert.equal(canOperatorAccessDistrict('multi@example.com', 'north'), true);
  assert.equal(canOperatorAccessDistrict('multi@example.com', 'south'), true);
  assert.equal(canOperatorAccessDistrict('multi@example.com', 'jerusalem'), false);
  const api = operatorDistrictAccessForApi('multi@example.com');
  assert.deepEqual(api.districtIds, ['north', 'south']);
  assert.ok(api.allowedReportScopes.includes('national'));
  assert.ok(api.allowedReportScopes.includes('north'));
});

test('allDistricts flag grants unrestricted access under enforcement', () => {
  resetOperatorDistrictAccessCache();
  setOperatorDistrictAccessConfigForTests({
    operatorDistrictEnforcementEnabled: true,
    users: [{ email: 'admin@example.com', level: 'operator', allDistricts: true }],
  });
  const access = resolveOperatorDistrictAccess('admin@example.com');
  assert.equal(access.unrestricted, true);
  assert.equal(canOperatorAccessDistrict('admin@example.com', 'haifa'), true);
});

test('analyst and maintainer bypass district limits when enforcement is on', () => {
  resetOperatorDistrictAccessCache();
  setOperatorDistrictAccessConfigForTests({
    operatorDistrictEnforcementEnabled: true,
    users: [
      { email: 'reviewer@example.com', level: 'analyst' },
      { email: 'ops@example.com', level: 'maintainer' },
    ],
  });
  for (const email of ['reviewer@example.com', 'ops@example.com']) {
    const access = resolveOperatorDistrictAccess(email);
    assert.equal(access.unrestricted, true, email);
    assert.equal(canOperatorAccessDistrict(email, 'north'), true, email);
    assert.equal(canOperatorAccessDistrict(email, 'haifa'), true, email);
  }
});

test('enforcement requires at least one configured operator', () => {
  resetOperatorDistrictAccessCache();
  setOperatorDistrictAccessConfigForTests({ operatorDistrictEnforcementEnabled: true, users: [] });
  const access = resolveOperatorDistrictAccess('anyone@example.com');
  assert.equal(access.unrestricted, true);
});
