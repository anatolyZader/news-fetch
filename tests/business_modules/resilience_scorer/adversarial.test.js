import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { scoreComponents } from '../../../business_modules/resilience_scorer/analyst/scoring/index.js';
import { computeDataVoidIndex } from '../../../business_modules/resilience_scorer/domain/services/dataVoidIndex.js';
import { resolveScoringPartition } from '../../../business_modules/resilience_scorer/domain/services/dataVoid/scoringPartition.js';
import { runScoringPipeline } from '../../../business_modules/resilience_scorer/app/assessment/scoringPipelinePrep.js';
import { dedupeSignalsWithinBatch, verifyEvidenceAgainstArticle }
  from '../../../business_modules/resilience_scorer/infrastructure/signalVerification.js';
import { crossSourceDedup } from '../../../business_modules/resilience_scorer/app/assessment/assessSignalsHelpers.js';
import { enrichProbeSignalsInList } from '../../../business_modules/resilience_scorer/domain/services/signals/probeCorroborationPolicy.js';

import { ADVERSARIAL_CASES_PATH } from '../../../business_modules/resilience_scorer/analyst/tuning/goldenPaths.js';

const fixture = JSON.parse(readFileSync(ADVERSARIAL_CASES_PATH, 'utf8'));
const liveLlm = process.env.RESILIENCE_LIVE_LLM === '1';

function generateOutletFloodPositive() {
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
}

function generateLowConfidenceNegatives() {
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
}

function generateSingleSourceCalm() {
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
}

function generateSaturationPositiveCalm() {
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
}

function _generateTelegramFloodWithField(baseSignals) {
  const out = [...(baseSignals ?? [])];
  for (let i = 0; i < 8; i++) {
    out.push({
      article_index: 100 + i,
      article_url: `https://t.me/panic${i}`,
      article_source: `tg-panic-${i}`,
      source_type: 'telegram',
      signal_type: 'fear_expression',
      evidence_type: 'observational_reported_fact',
      scope_level: 'repeated_pattern',
      evidence: `Telegram panic message about connectivity and mass evacuation ${i}`,
      extraction_confidence: 0.85,
      temporal_weight: 1,
    });
  }
  return out;
}

function generateMilitaryNewsFloodWithOneRadio() {
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
}

function generateYnetGeoNegativesWithOneMaariv() {
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
}

const EXTRACTION_GENERATORS = {
  outlet_flood_positive: generateOutletFloodPositive,
  low_confidence_negatives: generateLowConfidenceNegatives,
  single_source_calm: generateSingleSourceCalm,
  saturation_positive_calm: generateSaturationPositiveCalm,
  military_news_flood_with_one_radio: generateMilitaryNewsFloodWithOneRadio,
  ynet_geo_negatives_with_one_maariv: generateYnetGeoNegativesWithOneMaariv,
};

/**
 * Generators for the small number of cases that ask for many repeated signals
 * (kept as compact strings in the fixture rather than 9-15 lines of JSON each).
 */
function makeMockExtraction(spec) {
  if (Array.isArray(spec)) return spec;
  if (spec && typeof spec === 'string') {
    const key = spec.split(' ')[0];
    const generator = EXTRACTION_GENERATORS[key];
    if (!generator) {
      throw new Error(`unknown extraction generator: ${spec}`);
    }
    return generator();
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

function assertScoreFlagMaps(c, exp, scored) {
  if (exp.confidence) {
    for (const [cid, want] of Object.entries(exp.confidence)) {
      assert.equal(scored[cid]?.confidence, want, `${c.id}: confidence.${cid}`);
    }
  }
  if (exp.floor_clamped) {
    for (const [cid, want] of Object.entries(exp.floor_clamped)) {
      assert.equal(scored[cid]?.floor_clamped, want, `${c.id}: floor_clamped.${cid}`);
    }
  }
  if (exp.salience_critical) {
    for (const [cid, want] of Object.entries(exp.salience_critical)) {
      assert.equal(scored[cid]?.salience_critical, want, `${c.id}: salience_critical.${cid}`);
    }
  }
  if (exp.floor_bypassed) {
    for (const [cid, want] of Object.entries(exp.floor_bypassed)) {
      assert.equal(scored[cid]?.floor_bypassed, want, `${c.id}: floor_bypassed.${cid}`);
    }
  }
  if (exp.source_cap_binding) {
    for (const [cid, want] of Object.entries(exp.source_cap_binding)) {
      assert.equal(scored[cid]?.source_cap_binding, want, `${c.id}: source_cap_binding.${cid}`);
    }
  }
}

function assertScoreNumericMaps(c, exp, scored) {
  if (exp.min_suppression_delta) {
    for (const [cid, min] of Object.entries(exp.min_suppression_delta)) {
      const d = scored[cid]?.suppression_delta;
      assert.ok(d != null && Math.abs(d) >= min,
        `${c.id}: suppression_delta.${cid}=${d} < min ${min}`);
    }
  }
  if (exp.min_evidence_mass_band) {
    for (const [cid, [lo, hi]] of Object.entries(exp.min_evidence_mass_band)) {
      const m = scored[cid]?.evidence_mass;
      assert.ok(m != null && m >= lo && m < hi,
        `${c.id}: evidence_mass.${cid}=${m} not in [${lo}, ${hi})`);
    }
  }
}

function assertScoreExpectations(c, exp, scored) {
  if (exp.all_components_insufficient) assertAllComponentsInsufficient(c, scored);
  if (exp.score_range) assertScoreRange(c, exp, scored);
  assertScoreBounds(c, exp, scored);
  if (exp.min_polarization) assertMinPolarization(c, exp, scored);
  assertScoreFlagMaps(c, exp, scored);
  assertScoreNumericMaps(c, exp, scored);
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

function assertDataVoidExpectations(c, exp, dv) {
  if (!exp.data_void) return;
  for (const [key, want] of Object.entries(exp.data_void)) {
    assert.equal(dv[key], want, `${c.id}: data_void.${key}`);
  }
}

function assertPartitionExpectations(c, exp, partition) {
  if (exp.scoring_partition.assessmentMode) {
    assert.equal(partition.assessmentMode, exp.scoring_partition.assessmentMode,
      `${c.id}: scoring_partition.assessmentMode`);
  }
  if (exp.scoring_partition.min_quarantined_count != null) {
    assert.ok(partition.quarantinedSignals.length >= exp.scoring_partition.min_quarantined_count,
      `${c.id}: expected >= ${exp.scoring_partition.min_quarantined_count} quarantined`);
  }
}

function assertPipelineExpectations(c, exp, pipeline) {
  if (exp.pipeline.assessment_mode) {
    assert.equal(pipeline.assessmentMode, exp.pipeline.assessment_mode,
      `${c.id}: pipeline.assessment_mode`);
  }
  if (exp.pipeline.field_score_present === true) {
    const hasScore = Object.values(pipeline.scoredFull ?? {}).some((comp) => comp?.score != null);
    assert.ok(hasScore, `${c.id}: expected at least one non-null field-derived score`);
  }
  if (exp.pipeline.min_quarantined_count != null) {
    assert.ok((pipeline.quarantinedDigital?.count ?? 0) >= exp.pipeline.min_quarantined_count,
      `${c.id}: pipeline quarantined count`);
  }
}

function assertScoringPartitionExpectations(c, exp, signals) {
  if (!exp.scoring_partition && !exp.pipeline) return;

  process.env.RESILIENCE_SCORING_PARTITION = '1';
  process.env.RESILIENCE_EWMA_FREEZE_ON_EPISTEMIC = '1';

  const dv = computeDataVoidIndex(signals, c.historical_signals ?? []);
  assertDataVoidExpectations(c, exp, dv);

  if (exp.scoring_partition) {
    assertPartitionExpectations(c, exp, resolveScoringPartition(signals, dv));
  }

  if (exp.pipeline) {
    assertPipelineExpectations(c, exp, runScoringPipeline({
      signalsForScoring: signals,
      dataVoid: dv,
      totalArticles: Math.max(signals.length, 1),
      salienceContext: {},
      historicalScores: {},
      scopeId: 'national',
      validationMaturity: null,
    }));
  }
}

function runPipelineCase(c, exp) {
  const signals = resolveSignals(c);
  const dedupedWithin = dedupeSignalsWithinBatch(signals);
  const dedupedAll = enrichProbeSignalsInList(crossSourceDedup(dedupedWithin));
  assertDedupCounts(c, exp, dedupedWithin, dedupedAll);

  if (exp.scoring_partition || exp.pipeline) {
    assertScoringPartitionExpectations(c, exp, dedupedAll);
    if (!exp.score_range && !exp.all_components_insufficient) return;
  }

  if (exp.data_void && !exp.scoring_partition && !exp.pipeline) {
    const dv = computeDataVoidIndex(dedupedAll, c.historical_signals ?? []);
    for (const [key, want] of Object.entries(exp.data_void)) {
      assert.equal(dv[key], want, `${c.id}: data_void.${key}`);
    }
  }

  const scored = scoreComponents(dedupedAll, { totalArticles: dedupedAll.length || 1 });
  assertScoreExpectations(c, exp, scored);
  assertEvidenceMassExpectations(c, exp, scored);
}

function runAdversarialScenario(c) {
  const exp = c.expectations ?? {};
  if (c.mock_signal && c.article_body != null) {
    assertVerifierCase(c, exp);
    return;
  }
  runPipelineCase(c, exp);
}

describe('Resilience adversarial regression suite (N2)', () => {
  for (const c of fixture.cases) {
    if (c.live_llm_only && !liveLlm) {
      it.skip(`[skipped: needs RESILIENCE_LIVE_LLM=1] ${c.id} (${c.category})`, () => {});
      continue;
    }

    it(`${c.id} — ${c.scenario}`, () => {
      runAdversarialScenario(c);
    });
  }
});
