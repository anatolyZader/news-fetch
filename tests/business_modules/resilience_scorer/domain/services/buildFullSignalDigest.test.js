import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFullSignalDigest,
  narrativeDigestSignalCap,
  narrativeDigestEvidenceChars,
} from '../../../../../business_modules/resilience_scorer/domain/services/narrative/buildFullSignalDigest.js';
import { buildDigestStubClaims } from '../../../../../business_modules/resilience_scorer/domain/services/narrative/buildNarrativeScoredComponents.js';
import { buildSignalRefRegistry } from '../../../../../business_modules/resilience_scorer/domain/services/narrativeGrounding/signalRefRegistry.js';

const envBackup = {};

function saveEnv(keys) {
  for (const k of keys) envBackup[k] = process.env[k];
}

function restoreEnv(keys) {
  for (const k of keys) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
}

describe('buildFullSignalDigest', () => {
  beforeEach(() => saveEnv(['RESILIENCE_NARRATIVE_DIGEST_SIGNALS', 'RESILIENCE_NARRATIVE_DIGEST_EVIDENCE_CHARS']));
  afterEach(() => restoreEnv(['RESILIENCE_NARRATIVE_DIGEST_SIGNALS', 'RESILIENCE_NARRATIVE_DIGEST_EVIDENCE_CHARS']));

  it('exposes cap resolvers with defaults', () => {
    delete process.env.RESILIENCE_NARRATIVE_DIGEST_SIGNALS;
    delete process.env.RESILIENCE_NARRATIVE_DIGEST_EVIDENCE_CHARS;
    assert.equal(narrativeDigestSignalCap(), 15);
    assert.equal(narrativeDigestEvidenceChars(), 500);
  });

  it('ranks higher-mass signals first within a component', () => {
    const light = {
      signal_type: 'fear_expression',
      article_url: 'https://example.com/light',
      evidence: 'mild concern',
      intensity: 'light',
      scope_level: 'single_case',
      evidence_type: 'observational_reported_fact',
    };
    const severe = {
      signal_type: 'fear_expression',
      article_url: 'https://example.com/severe',
      evidence: 'severe distress',
      intensity: 'severe',
      scope_level: 'quantified_or_broad',
      evidence_type: 'named_survey_statistic',
    };

    const digest = buildFullSignalDigest([light, severe]);
    const refs = digest.narrative.signals.map((s) => s.article_url);
    assert.equal(refs[0], 'https://example.com/severe');
    assert.ok(refs.includes('https://example.com/light'));
  });

  it('dedupes second signal from the same article_url', () => {
    const a = {
      signal_type: 'fear_expression',
      article_url: 'https://example.com/same',
      evidence: 'first observation',
      intensity: 'severe',
      scope_level: 'quantified_or_broad',
      evidence_type: 'named_survey_statistic',
    };
    const b = {
      signal_type: 'fear_expression',
      article_url: 'https://example.com/same',
      evidence: 'second observation',
      intensity: 'light',
      scope_level: 'single_case',
      evidence_type: 'observational_reported_fact',
    };

    const digest = buildFullSignalDigest([a, b]);
    assert.equal(digest.narrative.signals.length, 1);
    assert.match(digest.narrative.signals[0].evidence, /first observation/);
  });

  it('respects RESILIENCE_NARRATIVE_DIGEST_SIGNALS cap', () => {
    process.env.RESILIENCE_NARRATIVE_DIGEST_SIGNALS = '2';
    const signals = Array.from({ length: 5 }, (_, i) => ({
      signal_type: 'fear_expression',
      article_url: `https://example.com/n${i}`,
      evidence: `observation ${i}`,
      intensity: 'moderate',
      scope_level: 'repeated_pattern',
      evidence_type: 'observational_reported_fact',
    }));

    const digest = buildFullSignalDigest(signals);
    assert.equal(digest.narrative.signals.length, 2);
  });

  it('preserves suppression fields from scoredFull', () => {
    const digest = buildFullSignalDigest([], {
      narrative: { suppression_delta: 2, score_raw: 9, score: 7 },
    });
    assert.equal(digest.narrative.suppression_delta, 2);
    assert.equal(digest.narrative.score_raw, 9);
    assert.equal(digest.narrative.signal_count, 0);
  });

  it('slices evidence to digest char cap', () => {
    process.env.RESILIENCE_NARRATIVE_DIGEST_EVIDENCE_CHARS = '20';
    const longEvidence = 'x'.repeat(100);
    const digest = buildFullSignalDigest([{
      signal_type: 'fear_expression',
      article_url: 'https://example.com/long',
      evidence: longEvidence,
      intensity: 'moderate',
      scope_level: 'repeated_pattern',
      evidence_type: 'observational_reported_fact',
    }]);
    assert.equal(digest.narrative.signals[0].evidence.length, 20);
  });
});

describe('buildDigestStubClaims', () => {
  it('builds one claim per digest signal with ref', () => {
    const narrativeScored = {
      narrative: {
        signals: [{
          signal_type: 'fear_expression',
          article_url: 'https://example.com/x',
          evidence: 'Residents report shelter use.',
        }],
        signal_count: 1,
      },
    };
    const registry = buildSignalRefRegistry(narrativeScored);
    const claims = buildDigestStubClaims(narrativeScored, registry);
    assert.ok(claims.narrative?.length >= 1);
    assert.ok(claims.narrative[0].signal_refs.length >= 1);
  });
});
