import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeEpistemicProfile } from '../../../../../business_modules/resilience_scorer/domain/epistemic/epistemicProfileBuilder.js';
import * as evidenceModule from '../../../../../business_modules/resilience_scorer/domain/contracts/componentEvidence.js';

describe('epistemicProfileBuilder', () => {
  it('marks thin evidence when no signals', () => {
    const profile = computeEpistemicProfile([], { reportDate: '2026-06-01' });
    assert.equal(profile.by_component.leadership.thin_evidence, true);
    assert.equal(profile.by_component.leadership.signal_count, 0);
    assert.equal(profile.by_component.leadership.sufficiency, 'none');
  });

  it('counts press signals into the routed component', () => {
    const profile = computeEpistemicProfile([
      {
        signal_type: 'information_clarity',
        source_type: 'news',
        article_source: 'ynet.co.il',
        article_url: 'https://ynet.co.il/a1',
        extraction_confidence: 1,
        evidence: 'test',
      },
    ], {
      reportDate: '2026-06-01',
    });
    const comp = profile.by_component.information_communication;
    assert.equal(comp.signal_count, 1);
    assert.equal(comp.thin_evidence, true);
    assert.equal(comp.positive_count, 1);
    // Compat alias mirrors the signal count (no evidence mass anymore).
    assert.equal(comp.evidence_mass, comp.signal_count);
  });

  it('v10: stamps trajectory labels, exposure context, and construct_role_mix', () => {
    const profile = computeEpistemicProfile([
      {
        signal_type: 'information_clarity',
        source_type: 'news',
        article_url: 'https://ynet.co.il/a1',
        evidence: 'test',
      },
    ], {
      reportDate: '2026-06-01',
      trajectories: { information_communication: { label: 'improving' } },
      exposureContext: { event_counts: { harm_to_population: 2 }, total_exposure_signals: 2 },
    });
    const comp = profile.by_component.information_communication;
    assert.equal(comp.delta_significance, 'improving');
    assert.equal(profile.by_component.leadership.delta_significance, null);
    assert.deepEqual(comp.construct_role_mix, { institutional_state: 1 });
    assert.equal(profile.assessment_epistemic.exposure_context.total_exposure_signals, 2);
  });

  it('requires corroboration for thin components via retrieval policies', () => {
    const profile = computeEpistemicProfile([], { reportDate: '2026-06-01' });
    assert.ok(profile.retrieval_policies.require_corroboration.some(
      (p) => p.component_id === 'leadership' && p.claim_type === 'any',
    ));
  });

  it('emits top-level cross_component_overlap and prefers ctx.componentEvidence', () => {
    const inline = computeEpistemicProfile([
      { signal_type: 'compliance_enter_shelter', source_type: 'news', article_url: 'https://x/1', evidence: 'a' },
      { signal_type: 'psychological_distress', source_type: 'news', article_url: 'https://x/1', evidence: 'b' },
    ], { reportDate: '2026-06-01' });
    assert.equal(inline.cross_component_overlap.shared_article_total, 1);

    // Precomputed evidence override wins over inline recomputation.
    const real = evidenceModule.buildComponentEvidence([]);
    real.cross_component_overlap = { shared_articles: [], shared_article_total: 99, components_involved: [] };
    const overridden = computeEpistemicProfile([], { reportDate: '2026-06-01', componentEvidence: real });
    assert.equal(overridden.cross_component_overlap.shared_article_total, 99);
  });

  it('warns on high shared-article share only with an adequate article base', () => {
    const mkProfileRow = (sharedShare, articles) => {
      const { buildComponentEvidence } = evidenceModule;
      const ev = buildComponentEvidence([]);
      ev.by_component.leadership.evidence_basis.shared_primary_articles = { count: Math.round(sharedShare * articles), share: sharedShare };
      ev.by_component.leadership.evidence_basis.distinct_articles = articles;
      return computeEpistemicProfile([], { componentEvidence: ev }).by_component.leadership;
    };
    const warned = mkProfileRow(0.8, 4);
    assert.ok(warned.dominance_warnings.some((w) => w.layer === 'cross_component_articles'));
    const belowShare = mkProfileRow(0.5, 4);
    assert.ok(!belowShare.dominance_warnings.some((w) => w.layer === 'cross_component_articles'));
    const thinBase = mkProfileRow(1, 2);
    assert.ok(!thinBase.dominance_warnings.some((w) => w.layer === 'cross_component_articles'));
    // Retrieval policies only react to source_type dominance — new layer is inert.
    const profile = computeEpistemicProfile([], { componentEvidence: (() => {
      const ev = evidenceModule.buildComponentEvidence([]);
      ev.by_component.leadership.evidence_basis.shared_primary_articles = { count: 4, share: 1 };
      ev.by_component.leadership.evidence_basis.distinct_articles = 4;
      return ev;
    })() });
    assert.ok(!profile.retrieval_policies.diversify.some((d) => d.source_type === 'shared'));
  });
});
