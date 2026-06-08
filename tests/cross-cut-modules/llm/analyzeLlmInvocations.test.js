import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseToolLoopRound,
  analyzeLlmInvocations,
  formatAnalysisReport,
} from '../../../cross-cut-modules/llm/analyzeLlmInvocations.js';

describe('analyzeLlmInvocations', () => {
  it('parseToolLoopRound extracts round from purpose', () => {
    assert.equal(parseToolLoopRound('chat:round-0'), 0);
    assert.equal(parseToolLoopRound('planner:round-3'), 3);
    assert.equal(parseToolLoopRound('decision-brief'), null);
  });

  it('rolls up per-feature cache totals and rounds', () => {
    const rows = [
      {
        feature: 'chat',
        purpose: 'chat:round-0',
        cachedInputTokens: 0,
        cacheCreationTokens: 2000,
        promptCacheApplied: true,
      },
      {
        feature: 'chat',
        purpose: 'chat:round-1',
        cachedInputTokens: 1800,
        cacheCreationTokens: 0,
        promptCacheApplied: true,
      },
    ];
    const report = analyzeLlmInvocations(rows);
    assert.equal(report.invocation_count, 2);
    assert.equal(report.by_feature.chat.count, 2);
    assert.equal(report.by_feature.chat.cachedReadTotal, 1800);
    assert.equal(report.by_feature.chat.cacheCreationTotal, 2000);
    assert.equal(report.by_feature.chat.promptCacheAppliedCount, 2);
    assert.equal(report.by_feature.chat.rounds[1].cachedRead, 1800);
    assert.equal(report.ok, true);
  });

  it('flags issue when cache created but not read on later rounds', () => {
    const prev = process.env.LLM_PROMPT_CACHE;
    process.env.LLM_PROMPT_CACHE = '1';
    try {
      const report = analyzeLlmInvocations([
        {
          feature: 'chat',
          purpose: 'chat:round-0',
          cachedInputTokens: 0,
          cacheCreationTokens: 500,
        },
        {
          feature: 'chat',
          purpose: 'chat:round-1',
          cachedInputTokens: 0,
          cacheCreationTokens: 0,
        },
      ]);
      assert.equal(report.ok, false);
      assert.match(report.issues[0], /cache was created on round-0/);
    } finally {
      if (prev === undefined) delete process.env.LLM_PROMPT_CACHE;
      else process.env.LLM_PROMPT_CACHE = prev;
    }
  });

  it('formatAnalysisReport includes PASS/FAIL status', () => {
    const text = formatAnalysisReport({
      invocation_count: 1,
      by_feature: {
        chat: {
          count: 1,
          cachedReadTotal: 100,
          cacheCreationTotal: 0,
          promptCacheAppliedCount: 1,
          rounds: {},
          purposes: ['chat:round-0'],
        },
      },
      issues: [],
      warnings: [],
      ok: true,
    });
    assert.match(text, /Status: PASS/);
    assert.match(text, /chat/);
  });
});
