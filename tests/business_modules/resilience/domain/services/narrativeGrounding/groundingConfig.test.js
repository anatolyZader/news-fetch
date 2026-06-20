import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveNarrativePipelineMode,
  hybridNarrativeEnabled,
  legacyNarrativeOnly,
  operatorNarrativePipelineEnabled,
} from '../../../../../../business_modules/resilience/domain/services/narrativeGrounding/groundingConfig.js';

describe('groundingConfig narrative pipeline mode', () => {
  let prev;

  beforeEach(() => {
    prev = process.env.RESILIENCE_NARRATIVE_PIPELINE;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.RESILIENCE_NARRATIVE_PIPELINE;
    else process.env.RESILIENCE_NARRATIVE_PIPELINE = prev;
  });

  it('defaults to hybrid when env unset', () => {
    delete process.env.RESILIENCE_NARRATIVE_PIPELINE;
    assert.equal(resolveNarrativePipelineMode(), 'hybrid');
    assert.equal(hybridNarrativeEnabled(), true);
    assert.equal(operatorNarrativePipelineEnabled(), true);
  });

  it('respects agent and legacy modes', () => {
    process.env.RESILIENCE_NARRATIVE_PIPELINE = 'agent';
    assert.equal(resolveNarrativePipelineMode(), 'agent');
    assert.equal(operatorNarrativePipelineEnabled(), false);

    process.env.RESILIENCE_NARRATIVE_PIPELINE = 'legacy';
    assert.equal(legacyNarrativeOnly(), true);
    assert.equal(operatorNarrativePipelineEnabled(), true);
  });
});
