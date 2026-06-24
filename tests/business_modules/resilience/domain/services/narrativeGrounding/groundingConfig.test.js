import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  narrativeFactsMaxTokens,
  narrativeJudgeMaxTokens,
} from '../../../../../../business_modules/resilience/domain/services/narrativeGrounding/groundingConfig.js';

describe('groundingConfig token caps', () => {
  it('defaults narrative facts max tokens to 12000', () => {
    const prev = process.env.RESILIENCE_NARRATIVE_FACTS_MAX_TOKENS;
    delete process.env.RESILIENCE_NARRATIVE_FACTS_MAX_TOKENS;
    assert.equal(narrativeFactsMaxTokens(), 12000);
    if (prev != null) process.env.RESILIENCE_NARRATIVE_FACTS_MAX_TOKENS = prev;
  });

  it('scales judge max tokens with claim count up to env cap', () => {
    const prev = process.env.RESILIENCE_NARRATIVE_JUDGE_MAX_TOKENS;
    process.env.RESILIENCE_NARRATIVE_JUDGE_MAX_TOKENS = '8000';
    assert.equal(narrativeJudgeMaxTokens(8), Math.min(8000, 200 + 8 * 120));
    if (prev == null) delete process.env.RESILIENCE_NARRATIVE_JUDGE_MAX_TOKENS;
    else process.env.RESILIENCE_NARRATIVE_JUDGE_MAX_TOKENS = prev;
  });
});
