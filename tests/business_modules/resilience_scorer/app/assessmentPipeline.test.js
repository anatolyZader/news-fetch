import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterCasualtyNoiseFromAnalysisSignals,
  scopeAndPartitionSignals,
} from '../../../../business_modules/resilience_scorer/app/assessmentPipeline.js';

describe('assessmentPipeline.scopeAndPartitionSignals', () => {
  it('returns national scoped signals unchanged for national scope', () => {
    const signals = [{ signal_type: 'foo', evidence: 'test signal', scopeDecision: { inScope: true } }];
    const out = scopeAndPartitionSignals(signals, 'national');
    assert.equal(out.scopedSignals.length, 1);
    assert.equal(out.baseSignalsForScoring.length, 1);
    assert.equal(out.narrativeNationalContext.length, 0);
    assert.equal(out.narrativeScopeSignals.length, 1);
  });

  it('filters crime and EMS aggregate noise from north scope analysis', () => {
    const northHarm = {
      signal_type: 'harm_to_population',
      evidence: 'שניים נפצעו משברי יירוט מירי מלבנון בבענה',
      district_id: 'north',
      source_type: 'news',
    };
    const crime = {
      signal_type: 'harm_to_population',
      evidence: 'שלושה בני אדם נפצעו באירוע אלימות בסולם שונם',
      district_id: 'north',
      source_type: 'news',
    };
    const aggregate = {
      signal_type: 'population_survey_finding',
      evidence: 'מתחילת מבצע שאגת הארי צוותי מגן דוד אדום העניקו טיפול רפואי ל- 2,223 בני אדם',
      district_id: 'north',
      source_type: 'news',
    };
    const out = scopeAndPartitionSignals([northHarm, crime, aggregate], 'north');
    assert.equal(out.scopedSignals.length, 1);
    assert.equal(out.scopedSignals[0].evidence, northHarm.evidence);
    assert.equal(out.narrativeScopeSignals.length, 1);
    assert.ok(!out.narrativeScopeSignals.some((s) => /אירוע אלימות|2,223/.test(s.evidence ?? '')));
  });

  it('filters bare siren city-list tickers from north scope analysis', () => {
    const northHarm = {
      signal_type: 'harm_to_population',
      evidence: 'שניים נפצעו משברי יירוט מירי מלבנון בבענה',
      district_id: 'north',
      source_type: 'news',
    };
    const alertTicker = {
      signal_type: 'routine_disruption',
      evidence:
        'אזעקות המתריעות על ירי טילים ורקטות הופעלו במרכז, בשרון ובשומרון, בין היתר בהרצליה, רמת השרון, חולון',
      district_id: 'north',
      source_type: 'news',
    };
    const out = scopeAndPartitionSignals([northHarm, alertTicker], 'north');
    assert.equal(out.scopedSignals.length, 1);
    assert.equal(out.scopedSignals[0].signal_type, 'harm_to_population');
  });
});

describe('filterCasualtyNoiseFromAnalysisSignals', () => {
  it('drops noise but keeps war-framed north harm', () => {
    const kept = filterCasualtyNoiseFromAnalysisSignals([
      { signal_type: 'harm_to_population', evidence: 'נפצעו קל בבענה משברי יירוט' },
      { signal_type: 'harm_to_population', evidence: 'נרצח בבאקה שנורה מטווח אפס' },
    ]);
    assert.equal(kept.length, 1);
    assert.match(kept[0].evidence, /בענה/);
  });
});
