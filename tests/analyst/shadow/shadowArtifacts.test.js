import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeDivergence } from '../../../business_modules/resilience_scorer/analyst/shadow/shadowArtifacts.js';

describe('computeDivergence', () => {
  it('returns shadow_only mode when agent severity is absent', () => {
    const result = computeDivergence(
      {
        components: [
          { component_id: 'narrative', confidence: 'high' },
          { component_id: 'leadership', confidence: 'medium' },
        ],
      },
      {
        narrative: { score: 8, evidence_mass: 10 },
        leadership: { score: 7, evidence_mass: 5 },
      },
    );
    assert.equal(result.mode, 'shadow_only');
    assert.equal(result.alignment_rate, null);
    assert.equal(result.by_component.narrative.shadow_score, 8);
    assert.ok(result.generated_at);
  });

  it('computes alignment when agent severity is present', () => {
    const result = computeDivergence(
      {
        components: [
          { component_id: 'narrative', severity: 'moderate', confidence: 'medium' },
        ],
      },
      { narrative: { score: 8, evidence_mass: 10 } },
    );
    assert.equal(result.mode, 'agent_shadow');
    assert.equal(typeof result.alignment_rate, 'number');
  });
});
