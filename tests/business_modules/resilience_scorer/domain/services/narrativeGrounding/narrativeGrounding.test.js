import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSignalRefRegistry,
  buildRefKey,
  validateClaimRelation,
  validateNarrativeOutput,
  computeGroundingScores,
  findForbiddenConnectives,
} from '../../../../../../business_modules/resilience_scorer/domain/services/narrativeGrounding/index.js';

describe('signalRefRegistry', () => {
  it('assigns stable refs per signal', () => {
    const registry = buildSignalRefRegistry({
      narrative: {
        signals: [{
          signal_type: 'fear_expression',
          article_url: 'https://a.example/1',
          evidence: 'Residents report fear',
        }],
      },
    });
    assert.equal(registry.refCount, 1);
    assert.ok(registry.byRef.has(buildRefKey({
      signal_type: 'fear_expression',
      article_url: 'https://a.example/1',
    })));
  });
});

describe('validateClaimRelation', () => {
  it('rejects same_article_only across different URLs', () => {
    const registry = buildSignalRefRegistry({
      lifesaving_behavior: {
        signals: [
          { signal_type: 'fear_expression', article_url: 'https://a/1', evidence: 'a' },
          { signal_type: 'compliance_enter_shelter', article_url: 'https://b/2', evidence: 'b' },
        ],
      },
    });
    const refs = [...registry.byRef.keys()];
    const result = validateClaimRelation(refs, 'same_article_only', registry);
    assert.equal(result.ok, false);
  });
});

describe('validateNarrativeOutput', () => {
  it('requires evidence when signals present', () => {
    const registry = buildSignalRefRegistry({
      narrative: {
        signal_count: 1,
        signals: [{ signal_type: 'fear_expression', article_url: 'https://x', evidence: 'fear' }],
      },
    });
    const result = validateNarrativeOutput({
      components: [{
        component_id: 'narrative',
        narrative: 'Reporting describes fear.',
        evidence: [],
        narrative_claims: [{
          text: 'fear',
          signal_refs: [buildRefKey({ signal_type: 'fear_expression', article_url: 'https://x' })],
          relation: 'parallel',
        }],
      }],
    }, { scoredComponents: { narrative: { signal_count: 1, signals: registry.byComponent.narrative.map((e) => e.signal) } }, registry });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('evidence[] required')));
  });
});

describe('computeGroundingScores', () => {
  it('flags ungrounded narrative sentences', () => {
    const registry = buildSignalRefRegistry({
      narrative: {
        signals: [{ signal_type: 'fear_expression', article_url: 'https://x', evidence: 'Residents report fear' }],
      },
    });
    const scores = computeGroundingScores({
      components: [{
        component_id: 'narrative',
        narrative: 'Completely invented unrelated claim about economy.',
        narrative_claims: [],
      }],
    }, { narrative: { signals: registry.byComponent.narrative.map((e) => e.signal) } }, registry);
    assert.ok(scores.byComponent.narrative.score < 1);
    assert.ok(scores.byComponent.narrative.issues.length > 0);
  });
});

describe('findForbiddenConnectives', () => {
  it('detects because', () => {
    assert.ok(findForbiddenConnectives('Fear because compliance').includes('because'));
  });
});
