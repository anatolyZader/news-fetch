import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOmissionAuditEnabled,
  isClosedCoreAssessEnabled,
  isOpenPipelineLegacyEnabled,
  isOpenObsForAgentEnabled,
  isResidualForAgentEnabled,
  openObsRoutingMode,
} from '../../../../../business_modules/resilience_scorer/domain/services/openExtractConfig.js';

describe('openExtractConfig', () => {
  it('omission audit defaults on', () => {
    assert.equal(isOmissionAuditEnabled({}), true);
    assert.equal(isOmissionAuditEnabled({ RESILIENCE_OMISSION_AUDIT: '0' }), false);
  });

  it('closed-core assess defaults on unless agent legacy', () => {
    assert.equal(isClosedCoreAssessEnabled({}), true);
    assert.equal(isClosedCoreAssessEnabled({ RESILIENCE_CLOSED_CORE_ASSESS: '0' }), false);
    assert.equal(isClosedCoreAssessEnabled({ RESILIENCE_ASSESSMENT_AGENT_LEGACY: '1' }), false);
  });

  it('open pipeline legacy defaults off', () => {
    assert.equal(isOpenPipelineLegacyEnabled({}), false);
    assert.equal(isOpenPipelineLegacyEnabled({ RESILIENCE_OPEN_PIPELINE_LEGACY: '1' }), true);
  });

  it('open obs for agent defaults off and stays off in omission audit mode', () => {
    assert.equal(isOpenObsForAgentEnabled({ RESILIENCE_OMISSION_AUDIT: '0' }), false);
    assert.equal(
      isOpenObsForAgentEnabled({ RESILIENCE_OPEN_OBS_FOR_AGENT: '1', RESILIENCE_OMISSION_AUDIT: '0' }),
      true,
    );
    assert.equal(
      isOpenObsForAgentEnabled({ RESILIENCE_OPEN_OBS_FOR_AGENT: '1', RESILIENCE_OMISSION_AUDIT: '1' }),
      false,
    );
  });

  it('residual for agent off in omission audit mode', () => {
    assert.equal(isResidualForAgentEnabled({ RESILIENCE_OMISSION_AUDIT: '1' }), false);
    assert.equal(isResidualForAgentEnabled({ RESILIENCE_OMISSION_AUDIT: '0' }), true);
  });

  it('open obs routing defaults to keyword', () => {
    assert.equal(openObsRoutingMode({}), 'keyword');
    assert.equal(openObsRoutingMode({ RESILIENCE_OPEN_OBS_ROUTING: 'llm' }), 'llm');
  });
});
