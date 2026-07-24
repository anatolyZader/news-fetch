import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  selectNarrativeNationalContext,
  selectRegionalPressContext,
  buildNarrativeScopeSignals,
  scopedSignalKeys,
  evidenceMatchesMacroNationalTerms,
  mergeNationalContextSignals,
} from '../../../../../business_modules/resilience_scorer/domain/services/narrative/narrativeScopeSignals.js';
import { annotateScopeDecisions } from '../../../../../business_modules/resilience_scorer/domain/services/signals/regionSignalFilter.js';
import { scopeAndPartitionSignals } from '../../../../../business_modules/resilience_scorer/app/assessment/signalScopePartition.js';
import { SIGNAL_PROVENANCE } from '../../../../../business_modules/resilience_scorer/domain/services/signals/evidenceEligibility.js';

describe('narrativeScopeSignals', () => {
  it('evidenceMatchesMacroNationalTerms matches northern israel phrasing', () => {
    assert.equal(
      evidenceMatchesMacroNationalTerms('Government briefed on residents of northern Israel.'),
      true,
    );
    assert.equal(evidenceMatchesMacroNationalTerms('Tel Aviv studio discussion.'), false);
  });

  it('selectRegionalPressContext includes scope-excluded press with north keywords', () => {
    const scoped = [{
      source_type: 'visits',
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
    const ctx = selectRegionalPressContext([...scoped, national], 'north', keys);
    assert.equal(ctx.length, 1);
    assert.equal(ctx[0].signalProvenance, SIGNAL_PROVENANCE.regional_press_context);
    assert.equal(ctx[0].metricsEligible, false);
    assert.equal(ctx[0].narrativeContextOnly, true);
  });

  it('selectNarrativeNationalContext tier B includes central press without macro keywords', () => {
    const scoped = [{
      source_type: 'visits',
      signal_type: 'information_clarity',
      evidence: 'North field note.',
      district_id: 'north',
    }];
    const central = annotateScopeDecisions([{
      source_type: 'news',
      signal_type: 'compliance_enter_shelter',
      evidence: 'Millions entered shelters in Tel Aviv after missile alert.',
      article_url: 'https://example.com/tel-aviv-shelter',
      geo: {
        kind: 'resolved',
        classification: { geoAreaTags: ['dan'] },
        scopeDecision: { isNorthRelevant: false, isScopeRelevant: false },
      },
    }], 'north')[0];
    const keys = scopedSignalKeys(scoped);
    const ctx = selectNarrativeNationalContext([...scoped, central], 'north', keys);
    assert.equal(ctx.length, 1);
    assert.equal(ctx[0].signalProvenance, SIGNAL_PROVENANCE.narrative_national_context);
    assert.equal(ctx[0].article_url, 'https://example.com/tel-aviv-shelter');
  });

  it('selectNarrativeNationalContext excludes other-region LOCAL stories (named locality, local scope)', () => {
    const binyaminStory = annotateScopeDecisions([{
      source_type: 'news',
      signal_type: 'evacuation_displacement',
      evidence: 'עלו המשפחות הראשונות ליישוב החדש מעוז צור שבמערב בנימין',
      article_url: 'https://example.com/binyamin',
      scope_level: 'local',
      locality: 'בנימין',
      geo: {
        kind: 'unknown',
        scopeDecision: { isNorthRelevant: false, isScopeRelevant: false },
      },
    }], 'north')[0];
    const nationalStory = annotateScopeDecisions([{
      source_type: 'news',
      signal_type: 'compliance_enter_shelter',
      evidence: 'Millions entered shelters nationwide after missile alert.',
      article_url: 'https://example.com/nationwide',
      scope_level: 'national',
      geo: {
        kind: 'resolved',
        classification: { geoAreaTags: ['dan'] },
        scopeDecision: { isNorthRelevant: false, isScopeRelevant: false },
      },
    }], 'north')[0];
    const ctx = selectNarrativeNationalContext([binyaminStory, nationalStory], 'north', new Set());
    assert.equal(ctx.length, 1);
    assert.equal(ctx[0].article_url, 'https://example.com/nationwide');
  });

  it('selectNarrativeNationalContext does not duplicate north-local news', () => {
    const northNews = {
      source_type: 'news',
      signal_type: 'harm_to_population',
      evidence: 'Injuries reported in Haifa after missile strike.',
      article_url: 'https://example.com/haifa',
      district_id: 'north',
    };
    const keys = scopedSignalKeys([northNews]);
    const ctx = selectNarrativeNationalContext([northNews], 'north', keys);
    assert.equal(ctx.length, 0);
  });

  it('selectNarrativeNationalContext excludes out-of-scope harm tickers', () => {
    const scoped = [{
      source_type: 'visits',
      signal_type: 'information_clarity',
      evidence: 'North field note.',
      district_id: 'north',
    }];
    const centralHarm = annotateScopeDecisions([{
      source_type: 'news',
      signal_type: 'harm_to_population',
      evidence: 'מד״א מפנים חמישה נפגעים מבני ברק לאחר ירי טילים',
      article_url: 'https://example.com/bnei-brak',
      geo: {
        kind: 'resolved',
        classification: { geoAreaTags: ['dan'] },
        scopeDecision: { isNorthRelevant: false, isScopeRelevant: false },
      },
    }], 'north')[0];
    const keys = scopedSignalKeys(scoped);
    const ctx = selectNarrativeNationalContext([...scoped, centralHarm], 'north', keys);
    assert.equal(ctx.length, 0);
  });

  it('selectNarrativeNationalContext respects cap', () => {
    const scoped = [];
    const keys = scopedSignalKeys(scoped);
    const press = Array.from({ length: 50 }, (_, i) => ({
      source_type: 'news',
      signal_type: 'fear_expression',
      evidence: `Central Israel report ${i} about national homefront conditions.`,
      article_url: `https://example.com/central-${i}`,
      geo: { kind: 'resolved', classification: { geoAreaTags: ['dan'] } },
    }));
    const annotated = annotateScopeDecisions(press, 'north');
    const ctx = selectNarrativeNationalContext(annotated, 'north', keys, { cap: 10 });
    assert.equal(ctx.length, 10);
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
        source_type: 'visits',
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
    assert.ok(out.narrativeNationalContext.length >= 1 || out.regionalPressContext.length >= 1);
    assert.ok(out.narrativeScopeSignals.length > out.scopedSignals.length);
    for (const s of out.metricsSignals) {
      assert.notEqual(s.signalProvenance, SIGNAL_PROVENANCE.narrative_national_context);
    }
  });

  it('scopeAndPartitionSignals adds tier B central press to narrative pool', () => {
    const all = [
      {
        source_type: 'visits',
        signal_type: 'information_clarity',
        evidence: 'Field north note.',
        district_id: 'north',
      },
      {
        source_type: 'news',
        signal_type: 'compliance_enter_shelter',
        evidence: 'Shelter compliance in central Israel remained high overnight.',
        article_url: 'https://example.com/central-1',
        geo: {
          kind: 'resolved',
          classification: { geoAreaTags: ['dan'] },
          policy: { usableForMetrics: false },
        },
      },
    ];
    const out = scopeAndPartitionSignals(all, 'north');
    const newsInNarrative = out.narrativeScopeSignals.filter((s) => s.source_type === 'news');
    assert.ok(newsInNarrative.length >= 1);
    assert.ok(out.narrativeNationalContext.length >= 1);
    assert.equal(out.scopedSignals.filter((s) => s.source_type === 'news').length, 0);
  });

  it('mergeNationalContextSignals dedupes macro and narrative national', () => {
    const merged = mergeNationalContextSignals(
      [{ evidence: 'macro', signalProvenance: 'macro_national', signal_type: 'a' }],
      [{ evidence: 'nat ctx', signalProvenance: 'narrative_national_context', signal_type: 'b' }],
    );
    assert.equal(merged.length, 2);
  });

  it('synthetic Apr window: narrative pool news count exceeds north-local only', () => {
    const northLocal = Array.from({ length: 6 }, (_, i) => ({
      source_type: 'news',
      signal_type: 'harm_to_population',
      evidence: `Northern injury report ${i} in Haifa area.`,
      article_url: `https://example.com/north-${i}`,
      district_id: 'north',
    }));
    const central = Array.from({ length: 80 }, (_, i) => ({
      source_type: 'news',
      signal_type: 'fear_expression',
      evidence: `Central Israel homefront report ${i} from Tel Aviv metro.`,
      article_url: `https://example.com/central-${i}`,
      geo: {
        kind: 'resolved',
        classification: { geoAreaTags: ['dan'] },
        policy: { usableForMetrics: false },
      },
      signal_file_date: i < 40 ? '2026-04-05' : '2026-04-04',
    }));
    const field = [{
      source_type: 'visits',
      signal_type: 'information_clarity',
      evidence: 'Visit note from north community.',
      district_id: 'north',
    }];
    const out = scopeAndPartitionSignals([...field, ...northLocal, ...central], 'north');
    const northNewsInScoped = out.scopedSignals.filter((s) => s.source_type === 'news');
    const newsInNarrative = out.narrativeScopeSignals.filter((s) => s.source_type === 'news');
    assert.equal(northNewsInScoped.length, 6);
    assert.ok(newsInNarrative.length > 17);
    assert.equal(out.narrativeNationalContext.length, 60);
  });
});
