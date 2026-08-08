import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ACCESS_LEVELS,
  canRunAnalysisDisplay,
  canManageMailingRecipients,
  canViewDeveloperDisplay,
  listConfiguredUsers,
  resetUserAccessCache,
  resolveUserAccessLevel,
  setUserAccessConfigForTests,
  userAccessForApi,
} from '../../../cross-cut-modules/auth/userAccess.js';
import { resolveDisplayView, DISPLAY_VIEWS } from '../../../business_modules/resilience_scorer/domain/services/user/assessmentDisplayTier.js';

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
      users: [{ email: 'Developer@Example.com', level: 'developer' }],
    }));
    assert.deepEqual(listConfiguredUsers(configPath), [{ email: 'developer@example.com', level: 'developer' }]);
  });

  it('canViewDeveloperDisplay honors config and env', () => {
    setUserAccessConfigForTests({
      userDistrictEnforcementEnabled: false,
      users: [{ email: 'myzader@gmail.com', level: 'developer' }],
    });
    assert.equal(canViewDeveloperDisplay('myzader@gmail.com'), true);
    assert.equal(canViewDeveloperDisplay('stranger@test.io'), false);

    resetUserAccessCache();
    setUserAccessConfigForTests({ userDistrictEnforcementEnabled: false, users: [] });
    process.env.RESILIENCE_ANALYST_EMAILS = 'env-developer@test.io';
    assert.equal(canViewDeveloperDisplay('env-developer@test.io'), true);
  });

  it('maintainer level can run analysis', () => {
    setUserAccessConfigForTests({
      userDistrictEnforcementEnabled: false,
      users: [{ email: 'maintainer@test.io', level: 'maintainer' }],
    });
    assert.equal(canRunAnalysisDisplay('maintainer@test.io'), true);
    assert.equal(canViewDeveloperDisplay('maintainer@test.io'), true);
    assert.equal(resolveUserAccessLevel('maintainer@test.io'), ACCESS_LEVELS.maintainer);
  });

  it('userAccessForApi summarizes current user', () => {
    setUserAccessConfigForTests({
      userDistrictEnforcementEnabled: false,
      users: [{ email: 'myzader@gmail.com', level: 'developer' }],
    });
    assert.deepEqual(userAccessForApi('myzader@gmail.com'), {
      email: 'myzader@gmail.com',
      level: 'developer',
      canViewDeveloper: true,
      canRunAnalysis: false,
      isListed: true,
    });
  });

  it('reloads the config file when its mtime changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'user-access-'));
    const configPath = join(dir, 'userAccess.json');
    writeFileSync(configPath, JSON.stringify({
      users: [{ email: 'first@example.com', level: 'user' }],
    }));
    utimesSync(configPath, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
    assert.equal(listConfiguredUsers(configPath)[0].email, 'first@example.com');

    writeFileSync(configPath, JSON.stringify({
      users: [{ email: 'second@example.com', level: 'developer' }],
    }));
    utimesSync(configPath, new Date(1_700_000_100_000), new Date(1_700_000_100_000));
    assert.equal(listConfiguredUsers(configPath)[0].email, 'second@example.com');
  });

  it('treats invalid JSON as an empty config without throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'user-access-'));
    const configPath = join(dir, 'userAccess.json');
    writeFileSync(configPath, '{ not json');
    assert.deepEqual(listConfiguredUsers(configPath), []);
    assert.equal(resolveUserAccessLevel('anyone@example.com', configPath), null);
  });

  it('resolveDisplayView grants developer when canViewDeveloper is true', () => {
    setUserAccessConfigForTests({
      userDistrictEnforcementEnabled: false,
      users: [{ email: 'developer@example.com', level: 'developer' }],
    });
    assert.equal(
      resolveDisplayView({
        queryView: 'developer',
        canViewDeveloper: canViewDeveloperDisplay('developer@example.com'),
      }),
      DISPLAY_VIEWS.developer,
    );
    assert.equal(
      resolveDisplayView({
        queryView: 'developer',
        canViewDeveloper: canViewDeveloperDisplay('stranger@test.io'),
      }),
      DISPLAY_VIEWS.user,
    );
  });
});

describe('canManageMailingRecipients', () => {
  afterEach(() => {
    setUserAccessConfigForTests(null);
    delete process.env.MAIL_DIGEST_ADMIN_EMAILS;
    resetUserAccessCache();
  });

  it('is granted by the mailingAdmins allowlist, not by access level', () => {
    setUserAccessConfigForTests({
      mailingAdmins: ['boss@example.com'],
      users: [
        { email: 'boss@example.com', level: 'developer' },
        { email: 'chief@example.com', level: 'maintainer' },
      ],
    });

    assert.equal(canManageMailingRecipients('boss@example.com'), true);
    // A maintainer who is not on the list stays out: mailing rights are
    // deliberately independent of the ladder that opens the paid fetch routes.
    assert.equal(canManageMailingRecipients('chief@example.com'), false);
    assert.equal(canManageMailingRecipients('stranger@example.com'), false);
  });

  it('normalizes case and whitespace on both sides', () => {
    setUserAccessConfigForTests({ mailingAdmins: ['  BOSS@Example.com '], users: [] });
    assert.equal(canManageMailingRecipients('boss@example.com'), true);
    assert.equal(canManageMailingRecipients(' Boss@EXAMPLE.com '), true);
  });

  it('denies empty and missing addresses', () => {
    setUserAccessConfigForTests({ mailingAdmins: ['boss@example.com'], users: [] });
    for (const bad of ['', '   ', null, undefined]) {
      assert.equal(canManageMailingRecipients(bad), false);
    }
  });

  it('denies everyone when no allowlist is configured', () => {
    setUserAccessConfigForTests({ users: [{ email: 'boss@example.com', level: 'maintainer' }] });
    assert.equal(canManageMailingRecipients('boss@example.com'), false);
  });

  it('honours the MAIL_DIGEST_ADMIN_EMAILS override', () => {
    setUserAccessConfigForTests({ users: [] });
    process.env.MAIL_DIGEST_ADMIN_EMAILS = 'a@example.com, B@Example.com';
    assert.equal(canManageMailingRecipients('a@example.com'), true);
    assert.equal(canManageMailingRecipients('b@example.com'), true);
    assert.equal(canManageMailingRecipients('c@example.com'), false);
  });
});

describe('canManageMailingRecipients reads the real config file', () => {
  let dir;
  beforeEach(() => {
    resetUserAccessCache();
    dir = mkdtempSync(join(tmpdir(), 'user-access-mailing-'));
  });
  afterEach(() => {
    resetUserAccessCache();
  });

  // Regression guard: loadConfig copies known fields one by one, so a new config
  // key is silently dropped unless it is added there. Pinned-config tests cannot
  // catch that, because they bypass file loading entirely.
  it('carries mailingAdmins through JSON parsing', () => {
    const p = join(dir, 'userAccess.json');
    writeFileSync(p, JSON.stringify({
      mailingAdmins: ['boss@example.com'],
      users: [{ email: 'boss@example.com', level: 'developer' }],
    }));
    utimesSync(p, new Date(), new Date());

    assert.equal(canManageMailingRecipients('boss@example.com', p), true);
    assert.equal(canManageMailingRecipients('other@example.com', p), false);
  });

  it('denies everyone when the file omits the key or does not exist', () => {
    const p = join(dir, 'no-admins.json');
    writeFileSync(p, JSON.stringify({ users: [{ email: 'boss@example.com', level: 'maintainer' }] }));
    assert.equal(canManageMailingRecipients('boss@example.com', p), false);
    assert.equal(canManageMailingRecipients('boss@example.com', join(dir, 'missing.json')), false);
  });
});
