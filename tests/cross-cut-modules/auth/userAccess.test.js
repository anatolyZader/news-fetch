import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ACCESS_LEVELS,
  canRunAnalysisDisplay,
  canViewAnalystDisplay,
  listConfiguredUsers,
  resetUserAccessCache,
  resolveUserAccessLevel,
  setUserAccessConfigForTests,
  userAccessForApi,
} from '../../../cross-cut-modules/auth/userAccess.js';
import { resolveDisplayView, DISPLAY_VIEWS } from '../../../business_modules/resilience/domain/services/assessmentDisplayTier.js';

describe('userAccess', () => {
  beforeEach(() => {
    resetUserAccessCache();
  });

  afterEach(() => {
    resetUserAccessCache();
    delete process.env.RESILIENCE_ANALYST_EMAILS;
    delete process.env.RESILIENCE_MAINTAINER_EMAILS;
  });

  it('loads users from config file path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'user-access-'));
    const configPath = join(dir, 'userAccess.json');
    writeFileSync(configPath, JSON.stringify({
      users: [{ email: 'Analyst@Example.com', level: 'analyst' }],
    }));
    assert.deepEqual(listConfiguredUsers(configPath), [{ email: 'analyst@example.com', level: 'analyst' }]);
  });

  it('canViewAnalystDisplay honors config and env', () => {
    setUserAccessConfigForTests({
      operatorDistrictEnforcementEnabled: false,
      users: [{ email: 'myzader@gmail.com', level: 'analyst' }],
    });
    assert.equal(canViewAnalystDisplay('myzader@gmail.com'), true);
    assert.equal(canViewAnalystDisplay('stranger@test.io'), false);

    resetUserAccessCache();
    setUserAccessConfigForTests({ operatorDistrictEnforcementEnabled: false, users: [] });
    process.env.RESILIENCE_ANALYST_EMAILS = 'env-analyst@test.io';
    assert.equal(canViewAnalystDisplay('env-analyst@test.io'), true);
  });

  it('maintainer level can run analysis', () => {
    setUserAccessConfigForTests({
      operatorDistrictEnforcementEnabled: false,
      users: [{ email: 'maintainer@test.io', level: 'maintainer' }],
    });
    assert.equal(canRunAnalysisDisplay('maintainer@test.io'), true);
    assert.equal(canViewAnalystDisplay('maintainer@test.io'), true);
    assert.equal(resolveUserAccessLevel('maintainer@test.io'), ACCESS_LEVELS.maintainer);
  });

  it('userAccessForApi summarizes current user', () => {
    setUserAccessConfigForTests({
      operatorDistrictEnforcementEnabled: false,
      users: [{ email: 'myzader@gmail.com', level: 'analyst' }],
    });
    assert.deepEqual(userAccessForApi('myzader@gmail.com'), {
      email: 'myzader@gmail.com',
      level: 'analyst',
      canViewAnalyst: true,
      canRunAnalysis: false,
      isListed: true,
    });
  });

  it('resolveDisplayView grants analyst only for allowlisted email', () => {
    setUserAccessConfigForTests({
      operatorDistrictEnforcementEnabled: false,
      users: [{ email: 'analyst@example.com', level: 'analyst' }],
    });
    assert.equal(
      resolveDisplayView({ queryView: 'analyst', userEmail: 'analyst@example.com' }),
      DISPLAY_VIEWS.analyst,
    );
    assert.equal(
      resolveDisplayView({ queryView: 'analyst', userEmail: 'stranger@test.io' }),
      DISPLAY_VIEWS.operator,
    );
  });
});
