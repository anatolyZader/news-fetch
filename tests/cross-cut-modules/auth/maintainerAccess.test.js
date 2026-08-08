import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  canRunAnalysisDisplay,
} from '../../../cross-cut-modules/auth/maintainerAccess.js';
import {
  resetUserAccessCache,
  setUserAccessConfigForTests,
} from '../../../cross-cut-modules/auth/userAccess.js';

describe('maintainerAccess', () => {
  let prevEmails;

  beforeEach(() => {
    prevEmails = process.env.RESILIENCE_MAINTAINER_EMAILS;
    resetUserAccessCache();
    setUserAccessConfigForTests({ userDistrictEnforcementEnabled: false, users: [] });
  });

  afterEach(() => {
    if (prevEmails === undefined) delete process.env.RESILIENCE_MAINTAINER_EMAILS;
    else process.env.RESILIENCE_MAINTAINER_EMAILS = prevEmails;
    resetUserAccessCache();
  });

  it('canRunAnalysisDisplay is false when no maintainers configured', () => {
    delete process.env.RESILIENCE_MAINTAINER_EMAILS;
    assert.equal(canRunAnalysisDisplay('dev@example.com'), false);
  });

  it('canRunAnalysisDisplay mirrors config and env allowlist', () => {
    setUserAccessConfigForTests({
      userDistrictEnforcementEnabled: false,
      users: [{ email: 'maintainer@example.com', level: 'maintainer' }],
    });
    assert.equal(canRunAnalysisDisplay('maintainer@example.com'), true);
    assert.equal(canRunAnalysisDisplay('stranger@test.io'), false);
    assert.equal(canRunAnalysisDisplay(''), false);

    resetUserAccessCache();
    setUserAccessConfigForTests({ userDistrictEnforcementEnabled: false, users: [] });
    process.env.RESILIENCE_MAINTAINER_EMAILS = 'env-maintainer@test.io';
    assert.equal(canRunAnalysisDisplay('env-maintainer@test.io'), true);
  });
});
