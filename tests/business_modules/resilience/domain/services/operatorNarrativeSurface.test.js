import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProseFromClaims,
  buildCuratedEvidenceBullets,
  buildStructuredEvidenceItems,
  buildEpistemicOperatorProse,
  finalizeOperatorNarrativeSurface,
  isStubNarrative,
  resolveOperatorComponentNarrative,
  INSUFFICIENT_SYNTHESIS_NARRATIVE,
} from '../../../../../business_modules/resilience/domain/services/operatorNarrativeSurface.js';

describe('operatorNarrativeSurface', () => {
  it('isStubNarrative detects insufficient synthesis stub', () => {
    assert.equal(isStubNarrative(''), true);
    assert.equal(isStubNarrative(INSUFFICIENT_SYNTHESIS_NARRATIVE), true);
    assert.equal(isStubNarrative('Connected prose about resilience.'), false);
  });

  it('buildProseFromClaims joins up to three claims', () => {
    const out = buildProseFromClaims([
      { text: 'First claim.' },
      { text: 'Second claim.' },
      { text: 'Third claim.' },
      { text: 'Fourth ignored.' },
    ]);
    assert.equal(out, 'First claim. Separately, Second claim. Separately, Third claim.');
  });

  it('resolveOperatorComponentNarrative prefers narrative_operator then agent narrative', () => {
    assert.equal(
      resolveOperatorComponentNarrative({
        component_id: 'narrative',
        narrative_operator: 'Polished operator text.',
        narrative: 'Agent text.',
      }),
      'Polished operator text.',
    );
    assert.equal(
      resolveOperatorComponentNarrative({
        component_id: 'narrative',
        narrative: INSUFFICIENT_SYNTHESIS_NARRATIVE,
        narrative_operator: 'Polished operator text.',
      }),
      'Polished operator text.',
    );
    assert.equal(
      resolveOperatorComponentNarrative({
        component_id: 'narrative',
        narrative: 'Agent prose with citations.',
        narrative_operator: INSUFFICIENT_SYNTHESIS_NARRATIVE,
      }),
      'Agent prose with citations.',
    );
  });

  it('resolveOperatorComponentNarrative builds prose from claims when narratives are stubs', () => {
    const out = resolveOperatorComponentNarrative({
      component_id: 'leadership',
      narrative: INSUFFICIENT_SYNTHESIS_NARRATIVE,
      claims: [
        { text: 'Mayors reported fatigue.', evidence_refs: ['x@url:https://example.com/a'] },
        { text: 'Radio noted supply gaps.', evidence_refs: ['y@url:https://example.com/b'] },
      ],
    });
    assert.match(out, /Mayors reported fatigue/);
    assert.match(out, /Separately,/);
  });

  it('buildEpistemicOperatorProse returns qualitative template from ep slice', () => {
    const out = buildEpistemicOperatorProse('functional_continuity', {
      signal_count: 4,
      source_diversity: 2,
      contested: false,
      thin_evidence: false,
    });
    assert.match(out, /Functional continuity draws on multiple evidence channels/);
  });

  it('buildCuratedEvidenceBullets formats claim bullets with URLs', () => {
    const bullets = buildCuratedEvidenceBullets({
      narrative_claims: [{
        text: 'Schools opened late.',
        signal_refs: ['school_delay@url:https://news.example/item'],
      }],
    });
    assert.equal(bullets.length, 1);
    assert.match(bullets[0], /Schools opened late/);
    assert.match(bullets[0], /\[source\]\(https:\/\/news\.example\/item\)/);
  });

  it('buildStructuredEvidenceItems includes source metadata from claims', () => {
    const items = buildStructuredEvidenceItems({
      claims: [{
        text: 'Field team noted supply gaps.',
        evidence_refs: ['gap@url:https://pbo.example/report'],
        source_type: 'pbo',
        article_source: 'pbo-north',
      }],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].source_type, 'pbo');
    assert.equal(items[0].article_source, 'pbo-north');
    assert.match(items[0].markdown, /Field team noted supply gaps/);
  });

  it('finalizeOperatorNarrativeSurface sets narrative_operator and evidence_operator', () => {
    const assessment = {
      components: [{
        component_id: 'narrative',
        narrative: INSUFFICIENT_SYNTHESIS_NARRATIVE,
        claims: [{ text: 'Sleep disruption reported.', evidence_refs: ['a@url:https://x.test/1'] }],
        instrument: { signal_count: 2, evidence_sufficiency: 'moderate' },
      }],
    };
    finalizeOperatorNarrativeSurface(assessment);
    assert.equal(assessment.narrative_pipeline_mode, 'hybrid');
    assert.match(assessment.components[0].narrative_operator, /Sleep disruption/);
    assert.equal(assessment.components[0].operator_evidence_tier, 'curated');
    assert.ok(assessment.components[0].evidence_operator?.length >= 1);
    assert.ok(assessment.components[0].evidence_operator_structured?.length >= 1);
  });
});
