import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  buildSignalRefRegistry,
  validateNarrativeOutput,
  validateClaimRelation,
  validateSuppressionCompliance,
  computeGroundingScores,
  findForbiddenConnectives,
} from '../../../business_modules/resilience/domain/services/narrativeGrounding/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(
    join(__dirname, '../../../analyst/tuning/adversarial/narrativeGroundingCases.json'),
    'utf8',
  ),
);

describe('narrativeGrounding adversarial fixtures', () => {
  const registry = buildSignalRefRegistry(fixtures.scored_components);
  const scored = fixtures.scored_components;

  it('rejects bad output: same_article_only across URLs', () => {
    const claim = fixtures.bad_narrative_output.components[0].narrative_claims[0];
    const rel = validateClaimRelation(claim.signal_refs, claim.relation, registry);
    assert.equal(rel.ok, false);
  });

  it('rejects bad output: causal connective in narrative', () => {
    const narrative = fixtures.bad_narrative_output.components[0].narrative;
    assert.ok(findForbiddenConnectives(narrative).includes('because'));
  });

  it('schema validator flags bad narrative output', () => {
    const result = validateNarrativeOutput(fixtures.bad_narrative_output, {
      scoredComponents: scored,
      registry,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  });

  it('sentence grounding flags ungrounded bad synthesis', () => {
    const scores = computeGroundingScores(
      fixtures.bad_narrative_output,
      scored,
      registry,
    );
    assert.ok(scores.synthesis.score < 1 || scores.synthesis.issues.length > 0);
  });

  it('accepts good narrative output for narrative component', () => {
    const result = validateNarrativeOutput(fixtures.good_narrative_output, {
      scoredComponents: scored,
      registry,
    });
    const narrativeErrors = result.errors.filter((e) => e.startsWith('narrative:'));
    assert.equal(narrativeErrors.length, 0, narrativeErrors.join('; '));
  });

  it('good output has higher grounding than bad', () => {
    const badScores = computeGroundingScores(fixtures.bad_narrative_output, scored, registry);
    const goodScores = computeGroundingScores(fixtures.good_narrative_output, scored, registry);
    assert.ok(
      goodScores.byComponent.narrative.score >= badScores.byComponent.narrative.score,
    );
  });
});

describe('suppression compliance adversarial fixtures', () => {
  const suppressionScored = fixtures.suppression_scored;

  it('rejects bad suppression output without caveat', () => {
    const result = validateSuppressionCompliance(fixtures.bad_suppression_output, suppressionScored);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('data_quality_caveat')));
  });

  it('rejects psych speculation in narrative', () => {
    const result = validateSuppressionCompliance({
      components: [{
        component_id: 'narrative',
        data_quality_caveat: 'Limited by source cap on ynet.co.il.',
        narrative: 'Hidden anxiety lurks beneath the surface despite positive signals.',
      }],
    }, suppressionScored);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('psych speculation')));
  });

  it('accepts good suppression output', () => {
    const result = validateSuppressionCompliance(fixtures.good_suppression_output, suppressionScored);
    assert.equal(result.ok, true, result.errors.join('; '));
  });
});
