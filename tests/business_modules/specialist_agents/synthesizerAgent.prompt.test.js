import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildSynthesizerSystem } from '../../../business_modules/specialist_agents/app/synthesizerAgent.js';

const saved = {};

function restoreEnv() {
  if ('RESILIENCE_ASSESS_SLIM_SYNTH' in saved) {
    process.env.RESILIENCE_ASSESS_SLIM_SYNTH = saved.RESILIENCE_ASSESS_SLIM_SYNTH;
  } else {
    delete process.env.RESILIENCE_ASSESS_SLIM_SYNTH;
  }
}

const assessments = [{
  component_id: 'leadership',
  severity: 'high',
  confidence: 'medium',
  user_status: 'watch',
  specialist_tier: 'A',
  narrative: 'Important finding',
  claims: [{ text: 'Mayor urged sheltering', evidence_refs: ['md:2026-05-30:1'] }],
  evidence_tree: [{ node: 'large' }],
  retrieval_gaps: ['need more field reports'],
}];

const epistemicProfile = {
  by_component: {
    leadership: {
      evidence_mass: 4,
      thin_evidence: false,
      contested: false,
      dominance_warnings: [{ message: 'x' }],
    },
  },
};

describe('synthesizerAgent prompts', () => {
  beforeEach(() => {
    saved.RESILIENCE_ASSESS_SLIM_SYNTH = process.env.RESILIENCE_ASSESS_SLIM_SYNTH;
  });
  afterEach(() => restoreEnv());

  it('slim synth omits evidence trees but keeps claim refs and oov_claims', () => {
    delete process.env.RESILIENCE_ASSESS_SLIM_SYNTH;
    const withOov = [{
      ...assessments[0],
      claims: [
        { text: 'Mayor urged sheltering', evidence_refs: ['md:2026-05-30:1'] },
        { text: 'Unknown phrasing burst', epistemic_flags: ['oov_cluster', 'unverified'] },
      ],
    }];
    const system = buildSynthesizerSystem(withOov, epistemicProfile);
    assert.ok(system.stable.includes('submit_synthesis'));
    assert.ok(system.dynamic.includes('md:2026-05-30:1'));
    assert.ok(system.dynamic.includes('oov_claims'));
    assert.ok(!system.dynamic.includes('evidence_tree'));
  });

  it('full dump when slim synth disabled', () => {
    process.env.RESILIENCE_ASSESS_SLIM_SYNTH = '0';
    const system = buildSynthesizerSystem(assessments, epistemicProfile);
    assert.ok(system.dynamic.includes('evidence_tree'));
  });

  it('renders exposure context block when present, omits when empty', () => {
    delete process.env.RESILIENCE_ASSESS_SLIM_SYNTH;
    const withExposure = {
      ...epistemicProfile,
      assessment_epistemic: {
        exposure_context: { event_counts: { harm_to_population: 3 }, max_intensity: 'severe', total_exposure_signals: 3 },
      },
    };
    const system = buildSynthesizerSystem(assessments, withExposure);
    assert.ok(system.dynamic.includes('EXPOSURE CONTEXT'));
    assert.ok(system.dynamic.includes('harm_to_population'));

    const without = buildSynthesizerSystem(assessments, epistemicProfile);
    assert.ok(!without.dynamic.includes('EXPOSURE CONTEXT'));
  });

  it('renders cross-component overlap block when present, omits when empty', () => {
    delete process.env.RESILIENCE_ASSESS_SLIM_SYNTH;
    const withOverlap = {
      ...epistemicProfile,
      cross_component_overlap: {
        shared_articles: [{ article_key: 'https://x/1', components: ['leadership', 'community_capital'], signal_count: 3 }],
        shared_article_total: 1,
        components_involved: ['leadership', 'community_capital'],
      },
    };
    const system = buildSynthesizerSystem(assessments, withOverlap);
    assert.ok(system.dynamic.includes('CROSS-COMPONENT ARTICLE OVERLAP'));
    assert.ok(system.dynamic.includes('shared coverage, not independent corroboration'));

    const empty = buildSynthesizerSystem(assessments, {
      ...epistemicProfile,
      cross_component_overlap: { shared_articles: [], shared_article_total: 0, components_involved: [] },
    });
    assert.ok(!empty.dynamic.includes('CROSS-COMPONENT ARTICLE OVERLAP'));
  });
});
