import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveInvestigationEpistemicContext } from '../../../../../business_modules/resilience/domain/services/investigationEpistemicContext.js';

describe('investigationEpistemicContext', () => {
  it('keeps assessmentMode normal under digital darkness', () => {
    const ctx = deriveInvestigationEpistemicContext({
      level: 'critical',
      digital_darkness: true,
      reason: 'digital_darkness',
    });
    assert.equal(ctx.assessmentMode, 'normal');
    assert.equal(ctx.investigationMode, 'digital_darkness');
    assert.equal(ctx.epistemicStatus.investigation_mode, 'digital_darkness');
  });
});
