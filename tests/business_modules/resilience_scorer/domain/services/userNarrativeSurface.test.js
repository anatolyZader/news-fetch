import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProseFromClaims,
  buildCuratedEvidenceBullets,
  buildStructuredEvidenceItems,
  buildEpistemicUserProse,
  finalizeUserNarrativeSurface,
  isStubNarrative,
  resolveUserComponentNarrative,
  INSUFFICIENT_SYNTHESIS_NARRATIVE,
} from '../../../../../business_modules/resilience_scorer/domain/services/user/userNarrativeSurface.js';

describe('userNarrativeSurface', () => {
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

  it('resolveUserComponentNarrative prefers narrative_user then agent narrative', () => {
    assert.equal(
      resolveUserComponentNarrative({
        component_id: 'narrative',
        narrative_user: 'Polished user text.',
        narrative: 'Agent text.',
      }),
      'Polished user text.',
    );
    assert.equal(
      resolveUserComponentNarrative({
        component_id: 'narrative',
        narrative: INSUFFICIENT_SYNTHESIS_NARRATIVE,
        narrative_user: 'Polished user text.',
      }),
      'Polished user text.',
    );
    assert.equal(
      resolveUserComponentNarrative({
        component_id: 'narrative',
        narrative: 'Agent prose with citations.',
        narrative_user: INSUFFICIENT_SYNTHESIS_NARRATIVE,
      }),
      'Agent prose with citations.',
    );
  });

  it('resolveUserComponentNarrative builds prose from claims when narratives are stubs', () => {
    const out = resolveUserComponentNarrative({
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

  it('buildEpistemicUserProse returns qualitative template from ep slice', () => {
    const out = buildEpistemicUserProse('functional_continuity', {
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

  it('buildStructuredEvidenceItems resolves @idx signal_refs to signal excerpts', () => {
    const items = buildStructuredEvidenceItems({
      component_id: 'narrative',
      narrative_claims: [{
        text: 'Summary claim [S3].',
        signal_refs: ['fear_expression@idx:3'],
      }],
      top_contributors: [{
        signal_type: 'fear_expression',
        article_index: 3,
        article_url: 'https://www.ynet.co.il/news/article-1',
        article_source: 'ynet.co.il',
        source_type: 'news',
        evidence: 'Residents report fear in shelters.',
      }],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].text, 'Residents report fear in shelters.');
    assert.equal(items[0].ref, 'fear_expression@idx:3');
    assert.equal(items[0].source_type, 'press');
    assert.equal(items[0].article_source, 'ynet.co.il');
    assert.match(items[0].markdown, /\[source\]\(https:\/\/www\.ynet\.co\.il\/news\/article-1\)/);
  });

  it('buildStructuredEvidenceItems emits one bullet per signal_ref', () => {
    const items = buildStructuredEvidenceItems({
      narrative_claims: [{
        text: 'Multiple sources [S1][S2].',
        signal_refs: ['type_a@idx:1', 'type_b@idx:2'],
      }],
      top_contributors: [
        {
          signal_type: 'type_a',
          article_index: 1,
          article_url: 'https://example.com/a',
          article_source: 'example.com',
          source_type: 'social',
          evidence: 'First excerpt.',
        },
        {
          signal_type: 'type_b',
          article_index: 2,
          article_url: 'https://example.com/b',
          article_source: 'example.com',
          source_type: 'press',
          evidence: 'Second excerpt.',
        },
      ],
    });
    assert.equal(items.length, 2);
    assert.equal(items[0].text, 'First excerpt.');
    assert.equal(items[1].text, 'Second excerpt.');
  });

  it('finalizeUserNarrativeSurface sets narrative_user and evidence_user', () => {
    const assessment = {
      components: [{
        component_id: 'narrative',
        narrative: INSUFFICIENT_SYNTHESIS_NARRATIVE,
        claims: [{ text: 'Sleep disruption reported.', evidence_refs: ['a@url:https://x.test/1'] }],
        instrument: { signal_count: 2, evidence_sufficiency: 'moderate' },
      }],
    };
    finalizeUserNarrativeSurface(assessment);
    assert.equal(assessment.narrative_pipeline_mode, 'hybrid');
    assert.match(assessment.components[0].narrative_user, /Sleep disruption/);
    assert.equal(assessment.components[0].user_evidence_tier, 'curated');
    assert.ok(assessment.components[0].evidence_user?.length >= 1);
    assert.ok(assessment.components[0].evidence_user_structured?.length >= 1);
  });

  it('rich pool fallback beats epistemic stub when claims are absent', () => {
    const prevMode = process.env.RESILIENCE_OPERATOR_SURFACE_MODE;
    process.env.RESILIENCE_OPERATOR_SURFACE_MODE = 'rich';

    const assessment = {
      components: [{
        component_id: 'narrative',
        narrative: INSUFFICIENT_SYNTHESIS_NARRATIVE,
        user_surface_mode: 'rich',
        user_investigation_pool: [
          { ref: 'a@url:https://x.test/1', evidence: 'First pool excerpt.', url: 'https://x.test/1' },
          { ref: 'b@url:https://x.test/2', evidence: 'Second pool excerpt.', url: 'https://x.test/2' },
        ],
        instrument: { signal_count: 5, source_diversity: 1 },
      }],
    };

    finalizeUserNarrativeSurface(assessment);
    assert.match(assessment.components[0].narrative_user, /First pool excerpt/);
    assert.match(assessment.components[0].narrative_user, /Second pool excerpt/);
    assert.doesNotMatch(assessment.components[0].narrative_user, /limited evidence base/);

    if (prevMode === undefined) delete process.env.RESILIENCE_OPERATOR_SURFACE_MODE;
    else process.env.RESILIENCE_OPERATOR_SURFACE_MODE = prevMode;
  });

  it('finalizeUserNarrativeSurface resolves @idx refs in narrative_user via citation registry', () => {
    const assessment = {
      date: '2026-04-02',
      narrative_citation_registry: {
        entries: [{
          label: 'S7',
          ref: 'resilience_narrative_positive@idx:7',
          source_type: 'visits',
          article_source: 'visitor-name',
          article_url: null,
        }],
      },
      components: [{
        component_id: 'narrative',
        narrative_user:
          'Routine is returning [resilience_narrative_positive@idx:7].',
        narrative_pipeline_mode: 'hybrid',
        narrative_grounding_score: 0.9,
      }],
    };
    finalizeUserNarrativeSurface(assessment);
    assert.match(
      assessment.components[0].narrative_user,
      /\[Field visit\]\(#evidence-narrative-/,
    );
    assert.doesNotMatch(assessment.components[0].narrative_user, /@idx:/);
  });
});
