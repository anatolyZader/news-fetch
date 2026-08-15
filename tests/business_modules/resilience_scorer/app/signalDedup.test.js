import { describe, it } from 'node:test';
import assert from 'node:assert';

import { collapseNewsEvents } from '../../../../business_modules/resilience_scorer/app/assessment/signalDedup.js';

function newsSignal(over = {}) {
  return {
    source_type: 'news',
    signal_type: 'harm_to_population',
    locality: 'Kiryat Shmona',
    article_date: '2026-04-02',
    evidence_type: 'observational_reported_fact',
    scope_level: 'locality_specific',
    grounding_tier: 'grounded',
    grounding_reason: 'containment',
    temporal_weight: 1,
    ...over,
  };
}

describe('collapseNewsEvents', () => {
  it('collapses one event reported by several outlets and records the corroboration', () => {
    const out = collapseNewsEvents([
      newsSignal({ article_source: 'ynet.co.il', evidence: 'שני פצועים במצב קל בקריית שמונה' }),
      newsSignal({ article_source: 'haaretz.co.il', evidence: 'שני גברים נפצעו קל מרסיסים בקריית שמונה' }),
      newsSignal({ article_source: 'timesofisrael.com', evidence: 'שני אנשים נפצעו כשטיל הכה בבניין' }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0]._event_outlet_count, 3);
    assert.deepEqual(out[0]._event_sources.sort(), ['haaretz.co.il', 'timesofisrael.com', 'ynet.co.il']);
    assert.equal(out[0]._event_variants.length, 2);
  });

  it('keeps a different locality as a separate event', () => {
    const out = collapseNewsEvents([
      newsSignal({ article_source: 'ynet.co.il', locality: 'Kiryat Shmona', evidence: 'א' }),
      newsSignal({ article_source: 'israelnationalnews.com', locality: 'Karmiel', evidence: 'ב' }),
    ]);
    assert.equal(out.length, 2);
  });

  it('keeps a different date as a separate event', () => {
    const out = collapseNewsEvents([
      newsSignal({ article_source: 'ynet.co.il', article_date: '2026-04-02', evidence: 'א' }),
      newsSignal({ article_source: 'ynet.co.il', article_date: '2026-04-03', evidence: 'ב' }),
    ]);
    assert.equal(out.length, 2);
  });

  it('keeps a different signal_type as a separate event', () => {
    const out = collapseNewsEvents([
      newsSignal({ article_source: 'inn.co.il', signal_type: 'harm_to_population', evidence: 'א' }),
      newsSignal({ article_source: 'inn.co.il', signal_type: 'infrastructure_damage_acute', evidence: 'ב' }),
    ]);
    assert.equal(out.length, 2);
  });

  it('gives the survivor the best grounding tier in the group', () => {
    const out = collapseNewsEvents([
      newsSignal({
        article_source: 'haaretz.co.il',
        evidence: 'א',
        grounding_tier: 'unverified_critical',
        grounding_reason: 'verification_failed_critical',
      }),
      newsSignal({
        article_source: 'ynet.co.il',
        evidence: 'ב',
        grounding_tier: 'grounded',
        grounding_reason: 'containment',
      }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].grounding_tier, 'grounded');
    assert.equal(out[0].grounding_reason, 'containment');
  });

  it('prefers the more specific claim as representative and keeps the broader one as a variant', () => {
    const broad = newsSignal({
      article_source: 'kipa.co.il',
      scope_level: 'quantified_or_broad',
      evidence: 'יותר מ-150 רקטות שוגרו לצפון, מספר בני אדם נפצעו',
    });
    const narrow = newsSignal({
      article_source: 'ynet.co.il',
      scope_level: 'single_incident',
      evidence: 'בן 85 ובן 34 נפצעו קל במבנה בקריית שמונה',
    });
    const out = collapseNewsEvents([broad, narrow]);
    assert.equal(out.length, 1);
    assert.equal(out[0].scope_level, 'single_incident');
    assert.equal(out[0]._event_variants[0].article_source, 'kipa.co.il');
    assert.match(out[0]._event_variants[0].evidence, /150/);
  });

  it('passes non-news source types through untouched', () => {
    const pbo = [
      { source_type: 'pbo', signal_type: 'community_volunteering', locality: 'Rama', article_date: '2026-04-02', evidence: 'א' },
      { source_type: 'pbo', signal_type: 'community_volunteering', locality: 'Rama', article_date: '2026-04-02', evidence: 'ב' },
    ];
    assert.equal(collapseNewsEvents(pbo).length, 2);
  });

  it('passes news signals with no locality through untouched', () => {
    const out = collapseNewsEvents([
      newsSignal({ article_source: 'ynet.co.il', locality: '', evidence: 'א' }),
      newsSignal({ article_source: 'inn.co.il', locality: '', evidence: 'ב' }),
    ]);
    assert.equal(out.length, 2);
  });

  it('honours the RESILIENCE_EVENT_DEDUP kill switch', () => {
    const prev = process.env.RESILIENCE_EVENT_DEDUP;
    process.env.RESILIENCE_EVENT_DEDUP = '0';
    try {
      const out = collapseNewsEvents([
        newsSignal({ article_source: 'ynet.co.il', evidence: 'א' }),
        newsSignal({ article_source: 'inn.co.il', evidence: 'ב' }),
      ]);
      assert.equal(out.length, 2);
    } finally {
      if (prev === undefined) delete process.env.RESILIENCE_EVENT_DEDUP;
      else process.env.RESILIENCE_EVENT_DEDUP = prev;
    }
  });

  it('merges outlets that spell one locality differently, via the resolved geo key', () => {
    const geo = { resolution: { canonicalKey: 'he_kiryat_shmona' } };
    const out = collapseNewsEvents([
      newsSignal({ article_source: 'ynet.co.il', locality: 'Kiryat Shmona', geo, evidence: '\u05d0' }),
      newsSignal({ article_source: 'inn.co.il', locality: '\u05e7\u05e8\u05d9\u05ea \u05e9\u05de\u05d5\u05e0\u05d4', geo, evidence: '\u05d1' }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0]._event_outlet_count, 2);
  });

  it('does not merge different canonical geo keys that share a raw locality string', () => {
    const out = collapseNewsEvents([
      newsSignal({ article_source: 'ynet.co.il', geo: { resolution: { canonicalKey: 'he_a' } }, evidence: '\u05d0' }),
      newsSignal({ article_source: 'inn.co.il', geo: { resolution: { canonicalKey: 'he_b' } }, evidence: '\u05d1' }),
    ]);
    assert.equal(out.length, 2);
  });

  it('does not add merge metadata to a singleton event', () => {
    const out = collapseNewsEvents([newsSignal({ article_source: 'ynet.co.il', evidence: 'א' })]);
    assert.equal(out.length, 1);
    assert.equal(out[0]._event_outlet_count, undefined);
  });
});
