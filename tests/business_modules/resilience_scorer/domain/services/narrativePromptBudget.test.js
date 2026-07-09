import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEGRADE_LEVELS,
  estimateTextTokens,
  isTokenOverflowError,
  narrativeContextMaxTokens,
  resolveNarrativeContextPlan,
  settingsForDegradeLevel,
} from '../../../../../business_modules/resilience_scorer/domain/services/narrative/narrativePromptBudget.js';

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

function makeSignal(i, evidenceLen = 80) {
  return {
    signal_type: 'fear_expression',
    article_url: `https://example.com/a-${i}`,
    evidence: 'x'.repeat(evidenceLen),
    scope_level: 'single_case',
    evidence_type: 'observational_reported_fact',
    extraction_confidence: 0.9,
    intensity: 'severe',
  };
}

describe('narrativePromptBudget', () => {
  beforeEach(() => saveEnv([
    'RESILIENCE_NARRATIVE_CONTEXT_MAX_TOKENS',
    'RESILIENCE_NARRATIVE_CHARS_PER_TOKEN',
    'RESILIENCE_NARRATIVE_DIGEST_SIGNALS',
    'RESILIENCE_NARRATIVE_DIGEST_EVIDENCE_CHARS',
    'RESILIENCE_NARRATIVE_RAG_ENABLED',
  ]));
  afterEach(() => restoreEnv([
    'RESILIENCE_NARRATIVE_CONTEXT_MAX_TOKENS',
    'RESILIENCE_NARRATIVE_CHARS_PER_TOKEN',
    'RESILIENCE_NARRATIVE_DIGEST_SIGNALS',
    'RESILIENCE_NARRATIVE_DIGEST_EVIDENCE_CHARS',
    'RESILIENCE_NARRATIVE_RAG_ENABLED',
  ]));

  it('estimateTextTokens scales with length', () => {
    process.env.RESILIENCE_NARRATIVE_CHARS_PER_TOKEN = '4';
    assert.ok(estimateTextTokens('abcd') >= 1);
    assert.ok(estimateTextTokens('a'.repeat(400)) > estimateTextTokens('a'.repeat(40)));
  });

  it('narrativeContextMaxTokens defaults to 180000', () => {
    delete process.env.RESILIENCE_NARRATIVE_CONTEXT_MAX_TOKENS;
    assert.equal(narrativeContextMaxTokens(), 180_000);
  });

  it('isTokenOverflowError detects API overflow messages', () => {
    assert.equal(isTokenOverflowError(new Error('prompt is too long: 221861 tokens > 200000 maximum')), true);
    assert.equal(isTokenOverflowError(new Error('network timeout')), false);
  });

  it('settingsForDegradeLevel returns ladder entries', () => {
    assert.equal(settingsForDegradeLevel(0).digestCap, 15);
    assert.equal(settingsForDegradeLevel(3).useStubClaims, true);
    assert.equal(settingsForDegradeLevel(5).skipLlm, true);
    assert.equal(DEGRADE_LEVELS.length, 6);
  });

  it('resolveNarrativeContextPlan escalates on huge corpus', () => {
    process.env.RESILIENCE_NARRATIVE_CONTEXT_MAX_TOKENS = '5000';
    process.env.RESILIENCE_NARRATIVE_RAG_ENABLED = '0';
    const signals = Array.from({ length: 400 }, (_, i) => makeSignal(i, 600));
    const plan = resolveNarrativeContextPlan({ narrativeScopeSignals: signals, scoredFull: null });
    assert.ok(plan.degradeLevel >= 1);
    assert.ok(plan.registry.refCount <= 50);
  });

  it('resolveNarrativeContextPlan level 5 skips LLM when budget tiny', () => {
    process.env.RESILIENCE_NARRATIVE_CONTEXT_MAX_TOKENS = '100';
    process.env.RESILIENCE_NARRATIVE_RAG_ENABLED = '0';
    const signals = Array.from({ length: 50 }, (_, i) => makeSignal(i, 400));
    const plan = resolveNarrativeContextPlan({ narrativeScopeSignals: signals, scoredFull: null });
    assert.equal(plan.skipLlm, true);
  });
});
