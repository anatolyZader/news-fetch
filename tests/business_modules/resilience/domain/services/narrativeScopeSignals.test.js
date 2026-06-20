import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectNarrativeNationalContext,
  buildNarrativeScopeSignals,
  scopedSignalKeys,
  evidenceMatchesMacroNationalTerms,
  mergeNationalContextSignals,
} from '../../../../../business_modules/resilience/domain/services/narrativeScopeSignals.js';
import { scopeAndPartitionSignals } from '../../../../../business_modules/resilience/app/assessmentPipeline.js';
import { SIGNAL_PROVENANCE } from '../../../../../business_modules/resilience/domain/services/evidenceEligibility.js';

describe('narrativeScopeSignals', () => {
  it('evidenceMatchesMacroNationalTerms matches northern israel phrasing', () => {
    assert.equal(
      evidenceMatchesMacroNationalTerms('Government briefed on residents of northern Israel.'),
      true,
    );
    assert.equal(evidenceMatchesMacroNationalTerms('Tel Aviv studio discussion.'), false);
  });

  it('selectNarrativeNationalContext includes scope-excluded national news', () => {
    const scoped = [{
      source_type: 'field',
      signal_type: 'information_clarity',
      evidence: 'Local north field note.',
      district_id: 'north',
    }];
    const national = {
      source_type: 'news',
      signal_type: 'information_clarity',
      evidence: 'Government briefed on conditions for residents of northern Israel.',
      article_url: 'https://example.com/national-front',
    };
    const keys = scopedSignalKeys(scoped);
    const ctx = selectNarrativeNationalContext([...scoped, national], 'north', keys);
    assert.equal(ctx.length, 1);
    assert.equal(ctx[0].signalProvenance, SIGNAL_PROVENANCE.narrative_national_context);
    assert.equal(ctx[0].metricsEligible, false);
    assert.equal(ctx[0].narrativeContextOnly, true);
  });

  it('buildNarrativeScopeSignals unions scoped and national context without dupes', () => {
    const scoped = [{ evidence: 'a', district_id: 'north' }];
    const nat = [{
      evidence: 'northern israel update',
      signalProvenance: SIGNAL_PROVENANCE.narrative_national_context,
      metricsEligible: false,
    }];
    const merged = buildNarrativeScopeSignals({ scopedSignals: scoped, narrativeNationalContext: nat });
    assert.equal(merged.length, 2);
  });

  it('scopeAndPartitionSignals keeps national context out of metricsSignals', () => {
    const all = [
      {
        source_type: 'field',
        signal_type: 'information_clarity',
        evidence: 'Field north note.',
        district_id: 'north',
      },
      {
        source_type: 'news',
        signal_type: 'information_clarity',
        evidence: 'National briefing on northern Israel front conditions.',
        article_url: 'https://example.com/nat',
      },
    ];
    const out = scopeAndPartitionSignals(all, 'north');
    assert.ok(out.metricsSignals.length >= 1);
    assert.ok(out.narrativeNationalContext.length >= 1);
    assert.ok(out.narrativeScopeSignals.length > out.scopedSignals.length);
    for (const s of out.metricsSignals) {
      assert.notEqual(s.signalProvenance, SIGNAL_PROVENANCE.narrative_national_context);
    }
  });

  it('mergeNationalContextSignals dedupes macro and narrative national', () => {
    const merged = mergeNationalContextSignals(
      [{ evidence: 'macro', signalProvenance: 'macro_national', signal_type: 'a' }],
      [{ evidence: 'nat ctx', signalProvenance: 'narrative_national_context', signal_type: 'b' }],
    );
    assert.equal(merged.length, 2);
  });
});
