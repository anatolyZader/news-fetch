import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canUserAccessDistrict,
  userDistrictAccessForApi,
  resetUserDistrictAccessCache,
  resolveUserDistrictAccess,
  setUserDistrictAccessConfigForTests,
} from '../../../cross-cut-modules/auth/userDistrictAccess.js';

test.afterEach(() => {
  resetUserDistrictAccessCache();
});

test('when enforcement is disabled all districts are allowed', () => {
  resetUserDistrictAccessCache();
  setUserDistrictAccessConfigForTests({ userDistrictEnforcementEnabled: false, users: [] });
  const access = resolveUserDistrictAccess('anyone@example.com');
  assert.equal(access.unrestricted, true);
  assert.equal(canUserAccessDistrict('anyone@example.com', 'south'), true);
});

test('unregistered user gets national only when enforcement is on', () => {
  resetUserDistrictAccessCache();
  setUserDistrictAccessConfigForTests({
    userDistrictEnforcementEnabled: true,
    users: [{ email: 'north@example.com', level: 'user', districtIds: ['north'] }],
  });
  const access = resolveUserDistrictAccess('unknown@example.com');
  assert.equal(access.enforcementEnabled, true);
  assert.equal(access.unrestricted, false);
  assert.deepEqual(access.districtIds, []);
  assert.deepEqual(access.allowedReportScopes, ['national']);
  assert.equal(canUserAccessDistrict('unknown@example.com', 'national'), true);
  assert.equal(canUserAccessDistrict('unknown@example.com', 'north'), false);
});

test('registered user is limited to assigned districts', () => {
  resetUserDistrictAccessCache();
  setUserDistrictAccessConfigForTests({
    userDistrictEnforcementEnabled: true,
    users: [{ email: 'multi@example.com', level: 'user', districtIds: ['north', 'south'] }],
  });
  assert.equal(canUserAccessDistrict('multi@example.com', 'north'), true);
  assert.equal(canUserAccessDistrict('multi@example.com', 'south'), true);
  assert.equal(canUserAccessDistrict('multi@example.com', 'jerusalem'), false);
  const api = userDistrictAccessForApi('multi@example.com');
  assert.deepEqual(api.districtIds, ['north', 'south']);
  assert.ok(api.allowedReportScopes.includes('national'));
  assert.ok(api.allowedReportScopes.includes('north'));
});

test('allDistricts flag grants unrestricted access under enforcement', () => {
  resetUserDistrictAccessCache();
  setUserDistrictAccessConfigForTests({
    userDistrictEnforcementEnabled: true,
    users: [{ email: 'admin@example.com', level: 'user', allDistricts: true }],
  });
  const access = resolveUserDistrictAccess('admin@example.com');
  assert.equal(access.unrestricted, true);
  assert.equal(canUserAccessDistrict('admin@example.com', 'haifa'), true);
});

test('developer and maintainer bypass district limits when enforcement is on', () => {
  resetUserDistrictAccessCache();
  setUserDistrictAccessConfigForTests({
    userDistrictEnforcementEnabled: true,
    users: [
      { email: 'reviewer@example.com', level: 'developer' },
      { email: 'ops@example.com', level: 'maintainer' },
    ],
  });
  for (const email of ['reviewer@example.com', 'ops@example.com']) {
    const access = resolveUserDistrictAccess(email);
    assert.equal(access.unrestricted, true, email);
    assert.equal(canUserAccessDistrict(email, 'north'), true, email);
    assert.equal(canUserAccessDistrict(email, 'haifa'), true, email);
  }
});

test('enforcement requires at least one configured user', () => {
  resetUserDistrictAccessCache();
  setUserDistrictAccessConfigForTests({ userDistrictEnforcementEnabled: true, users: [] });
  const access = resolveUserDistrictAccess('anyone@example.com');
  assert.equal(access.unrestricted, true);
});
