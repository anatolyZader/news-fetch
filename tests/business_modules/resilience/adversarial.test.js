import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { scoreComponents } from '../../../business_modules/resilience/domain/services/behaviorSignals.js';
import { dedupeSignalsWithinBatch, verifyEvidenceAgainstArticle }
  from '../../../business_modules/resilience/infrastructure/signalVerification.js';
import { crossSourceDedup } from '../../../business_modules/resilience/input/assessSignalsHelpers.js';

import { ADVERSARIAL_CASES_PATH } from '../../../business_modules/resilience/tuning/goldenPaths.js';

const fixture = JSON.parse(readFileSync(ADVERSARIAL_CASES_PATH, 'utf8'));
const liveLlm = process.env.RESILIENCE_LIVE_LLM === '1';

/**
 * Generators for the small number of cases that ask for many repeated signals
 * (kept as compact strings in the fixture rather than 9-15 lines of JSON each).
 */
function makeMockExtraction(spec) {
  if (Array.isArray(spec)) return spec;
  if (spec && typeof spec === 'string') {
    const generators = {
      outlet_flood_positive: () => {
        const out = [];
        for (let i = 0; i < 9; i++) {
          out.push({
            article_index: i + 1, article_url: `https://ynet.co.il/p${i}`,
            article_source: 'ynet.co.il', source_type: 'news',
            signal_type: 'resilience_narrative_positive',
            evidence_type: 'observational_reported_fact',
            scope_level: 'repeated_pattern',
            evidence: `flood signal ${i}`,
            extraction_confidence: 0.9, temporal_weight: 1,
          });
        }
        out.push({
          article_index: 100, article_url: 'https://maariv.co.il/p',
          article_source: 'maariv.co.il', source_type: 'news',
          signal_type: 'resilience_narrative_positive',
          evidence_type: 'observational_reported_fact',
          scope_level: 'repeated_pattern',
          evidence: 'maariv positive',
          extraction_confidence: 0.9, temporal_weight: 1,
        });
        return out;
      },
      low_confidence_negatives: () => {
        const out = [];
        for (let i = 0; i < 10; i++) {
          out.push({
            article_index: i + 1, article_url: `https://ynet.co.il/lc${i}`,
            article_source: 'ynet.co.il', source_type: 'news',
            signal_type: 'resilience_narrative_negative',
            evidence_type: 'observational_reported_fact',
            scope_level: 'repeated_pattern',
            evidence: `low-conf neg ${i}`,
            extraction_confidence: 0.2, temporal_weight: 1,
          });
        }
        return out;
      },
      single_source_calm: () => {
        const out = [];
        for (let i = 0; i < 6; i++) {
          out.push({
            article_index: i + 1, article_url: `https://ynet.co.il/c${i}`,
            article_source: 'ynet.co.il', source_type: 'news',
            signal_type: 'calm_confidence',
            evidence_type: 'observational_reported_fact',
            scope_level: 'repeated_pattern',
            evidence: `calm signal ${i}`,
            extraction_confidence: 0.9, temporal_weight: 1,
          });
        }
        return out;
      },
      saturation_positive_calm: () => {
        const sources = ['ynet.co.il', 'maariv.co.il', 'kan.org.il', 'haaretz.co.il', 'channel14.co.il'];
        const sourceTypes = ['news', 'news', 'radio', 'news', 'news'];
        const out = [];
        for (let i = 0; i < 15; i++) {
          out.push({
            article_index: i + 1, article_url: `https://x.com/sat${i}`,
            article_source: sources[i % sources.length],
            source_type: sourceTypes[i % sourceTypes.length],
            signal_type: 'calm_confidence',
            evidence_type: 'direct_quote_named_person',
            scope_level: 'quantified_or_broad',
            evidence: `quantified calm ${i}`,
            extraction_confidence: 1, temporal_weight: 1,
          });
        }
        return out;
      },
      military_news_flood_with_one_radio: () => {
        // Layer 1 (source_type) cap @ 50%: 8 news + 1 radio for the SAME positive
        // narrative. With a single source_type the cap would be a no-op; introducing
        // a 2nd source_type forces the cap to scale news contributions down.
        const newsOutlets = ['ynet.co.il', 'maariv.co.il', 'kan.org.il', 'haaretz.co.il'];
        const out = [];
        for (let i = 0; i < 8; i++) {
          out.push({
            article_index: i + 1,
            article_url: `https://${newsOutlets[i % newsOutlets.length]}/military${i}`,
            article_source: newsOutlets[i % newsOutlets.length],
            source_type: 'news',
            signal_type: 'resilience_narrative_positive',
            evidence_type: 'observational_reported_fact',
            scope_level: 'repeated_pattern',
            evidence: `news framing positive ${i}`,
            extraction_confidence: 0.9,
            temporal_weight: 1,
          });
        }
        out.push({
          article_index: 100,
          article_url: 'https://kan.org.il/radio-positive',
          article_source: 'kan.org.il',
          source_type: 'radio',
          signal_type: 'resilience_narrative_positive',
          evidence_type: 'observational_reported_fact',
          scope_level: 'repeated_pattern',
          evidence: 'radio framing positive once',
          extraction_confidence: 0.9,
          temporal_weight: 1,
        });
        return out;
      },
      ynet_geo_negatives_with_one_maariv: () => {
        // Layer 2 (article_source) cap @ 35%: 6 ynet negatives + 1 maariv negative
        // on wellbeing_at_risk. Two outlets present -> Layer 2 must scale ynet down.
        const out = [];
        for (let i = 0; i < 6; i++) {
          out.push({
            article_index: i + 1,
            article_url: `https://ynet.co.il/geo-neg${i}`,
            article_source: 'ynet.co.il',
            source_type: 'news',
            signal_type: 'fear_expression',
            evidence_type: 'observational_reported_fact',
            scope_level: 'quantified_or_broad',
            evidence: `Residents reported sustained fear in border towns ${i}`,
            extraction_confidence: 0.9,
            temporal_weight: 1,
          });
        }
        out.push({
          article_index: 100,
          article_url: 'https://maariv.co.il/balance-neg',
          article_source: 'maariv.co.il',
          source_type: 'news',
          signal_type: 'fear_expression',
          evidence_type: 'observational_reported_fact',
          scope_level: 'quantified_or_broad',
          evidence: 'Different reporter logged similar fear elsewhere',
          extraction_confidence: 0.9,
          temporal_weight: 1,
        });
        return out;
      },
    };
    if (!generators[spec]) {
      throw new Error(`unknown extraction generator: ${spec}`);
    }
    // Strip the inline _generator key in the fixture; we used the value above.
    return generators[spec.split(' ')[0]] ? generators[spec.split(' ')[0]]() : [];
  }
  return [];
}

function resolveSignals(c) {
  if (Array.isArray(c.mock_extraction)) return c.mock_extraction;
  if (c._generator && typeof c._generator === 'string') {
    return makeMockExtraction(c._generator);
  }
  // Fallback: treat string mock_extraction as the legacy shorthand.
  if (typeof c.mock_extraction === 'string' && c._generator) {
    return makeMockExtraction(c._generator);
  }
  return [];
}

function assertVerifierCase(c, exp) {
  const verdict = verifyEvidenceAgainstArticle(c.mock_signal, c.article_body);
  if (typeof exp.verifier_should_pass === 'boolean') {
    assert.equal(verdict.ok, exp.verifier_should_pass,
      `${c.id}: verifier_should_pass=${exp.verifier_should_pass} but got ok=${verdict.ok}, reason=${verdict.reason}, sim=${verdict.sim}`);
  }
}

function assertDedupCounts(c, exp, dedupedWithin, dedupedAll) {
  if (typeof exp.after_within_dedup_count === 'number') {
    assert.equal(dedupedWithin.length, exp.after_within_dedup_count,
      `${c.id}: expected ${exp.after_within_dedup_count} after within-source dedup, got ${dedupedWithin.length}`);
  }
  if (typeof exp.after_cross_source_dedup_count === 'number') {
    assert.equal(dedupedAll.length, exp.after_cross_source_dedup_count,
      `${c.id}: expected ${exp.after_cross_source_dedup_count} after cross-source dedup, got ${dedupedAll.length}`);
  }
}

function assertAllComponentsInsufficient(c, scored) {
  for (const [cid, c2] of Object.entries(scored)) {
    assert.equal(c2.confidence, 'insufficient_data',
      `${c.id}: ${cid} should be insufficient_data when no signals provided`);
    assert.equal(c2.score, null, `${c.id}: ${cid} score should be null`);
  }
}

function assertScoreRange(c, exp, scored) {
  for (const [cid, [lo, hi]] of Object.entries(exp.score_range)) {
    const sc = scored[cid]?.score;
    assert.ok(sc != null, `${c.id}: expected scored.${cid} but got null`);
    assert.ok(sc >= lo && sc <= hi,
      `${c.id}: scored.${cid}=${sc} out of expected range [${lo},${hi}]`);
  }
}

function assertScoreBounds(c, exp, scored) {
  if (typeof exp.score_max === 'number') {
    for (const [cid, c2] of Object.entries(scored)) {
      if (c2.score == null) continue;
      assert.ok(c2.score <= exp.score_max,
        `${c.id}: scored.${cid}=${c2.score} > score_max ${exp.score_max}`);
    }
  }
  if (typeof exp.score_min === 'number') {
    const someAbove = Object.values(scored).some((c2) => c2.score != null && c2.score >= exp.score_min);
    assert.ok(someAbove,
      `${c.id}: expected at least one component score >= ${exp.score_min}`);
  }
}

function assertMinPolarization(c, exp, scored) {
  for (const [cid, threshold] of Object.entries(exp.min_polarization)) {
    const p = scored[cid]?.polarization;
    assert.ok(p != null && p >= threshold,
      `${c.id}: polarization.${cid}=${p} < ${threshold}`);
  }
}

function assertScoreExpectations(c, exp, scored) {
  if (exp.all_components_insufficient) assertAllComponentsInsufficient(c, scored);
  if (exp.score_range) assertScoreRange(c, exp, scored);
  assertScoreBounds(c, exp, scored);
  if (exp.min_polarization) assertMinPolarization(c, exp, scored);
}

function assertEvidenceMassExpectations(c, exp, scored) {
  if (typeof exp.min_evidence_mass === 'number') {
    const totalMass = Object.values(scored).reduce((s, c2) => s + (c2.evidence_mass ?? 0), 0);
    assert.ok(totalMass >= exp.min_evidence_mass,
      `${c.id}: total evidence_mass ${totalMass} < ${exp.min_evidence_mass}`);
  }
  if (typeof exp.max_evidence_mass === 'number') {
    for (const [cid, c2] of Object.entries(scored)) {
      if (c2.evidence_mass == null) continue;
      assert.ok(c2.evidence_mass <= exp.max_evidence_mass,
        `${c.id}: evidence_mass.${cid}=${c2.evidence_mass} > max ${exp.max_evidence_mass}`);
    }
  }

  if (exp.max_source_diversity_factor) {
    for (const [cid, max] of Object.entries(exp.max_source_diversity_factor)) {
      const sdf = scored[cid]?.source_diversity_factor;
      assert.ok(sdf != null && sdf <= max,
        `${c.id}: source_diversity_factor.${cid}=${sdf} > max ${max}`);
    }
  }
}

function runPipelineCase(c, exp) {
  const signals = resolveSignals(c);
  const dedupedWithin = dedupeSignalsWithinBatch(signals);
  const dedupedAll = crossSourceDedup(dedupedWithin);
  assertDedupCounts(c, exp, dedupedWithin, dedupedAll);

  const scored = scoreComponents(dedupedAll, { totalArticles: dedupedAll.length || 1 });
  assertScoreExpectations(c, exp, scored);
  assertEvidenceMassExpectations(c, exp, scored);
}

describe('Resilience adversarial regression suite (N2)', () => {
  for (const c of fixture.cases) {
    if (c.live_llm_only && !liveLlm) {
      it.skip(`[skipped: needs RESILIENCE_LIVE_LLM=1] ${c.id} (${c.category})`, () => {});
      continue;
    }

    it(`${c.id} — ${c.scenario}`, () => {
      const exp = c.expectations ?? {};

      if (c.mock_signal && c.article_body != null) {
        assertVerifierCase(c, exp);
        return;
      }

      runPipelineCase(c, exp);
    });
  }
});
