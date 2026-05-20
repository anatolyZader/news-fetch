import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  canRunAnalysisDisplay,
} from '../../../../../business_modules/resilience/domain/services/resilienceMaintainerAccess.js';

describe('resilienceMaintainerAccess', () => {
  let prevEmails;

  beforeEach(() => {
    prevEmails = process.env.RESILIENCE_MAINTAINER_EMAILS;
  });

  afterEach(() => {
    if (prevEmails === undefined) delete process.env.RESILIENCE_MAINTAINER_EMAILS;
    else process.env.RESILIENCE_MAINTAINER_EMAILS = prevEmails;
  });

  it('denies when allowlist is empty', () => {
    delete process.env.RESILIENCE_MAINTAINER_EMAILS;
    assert.equal(canRunAnalysisDisplay('dev@example.com'), false);
  });

  it('grants only for allowlisted email', () => {
    process.env.RESILIENCE_MAINTAINER_EMAILS = 'Maintainer@Example.com, other@test.io';
    assert.equal(canRunAnalysisDisplay('maintainer@example.com'), true);
    assert.equal(canRunAnalysisDisplay('stranger@test.io'), false);
    assert.equal(canRunAnalysisDisplay(''), false);
  });
});
