import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySocialCandidates,
  postsToClassifierCandidates,
} from '../../../../business_modules/social_media/app/socialCandidateClassifier.js';

function mockAnthropicClient(responseText) {
  return {
    messages: {
      create: async () => ({
        usage: { input_tokens: 100, output_tokens: 50 },
        content: [{ type: 'text', text: responseText }],
      }),
    },
  };
}

describe('socialCandidateClassifier', () => {
  it('returns empty result for no candidates', async () => {
    const result = await classifySocialCandidates([], { skipBudgetCheck: true, skipCostLog: true });
    assert.deepEqual(result, { findings: [], rejected: {}, rejected_examples: [] });
  });

  it('postsToClassifierCandidates maps normalized posts', () => {
    const rows = postsToClassifierCandidates([
      {
        id: 'x-1',
        platform: 'x',
        text: 'תושבים במקלט',
        url: 'https://x.com/a/1',
        location: 'נהריה',
        postedAt: '2026-05-23T10:00:00Z',
        meta: { handle: 'user1', lang: 'he' },
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'x-1');
    assert.equal(rows[0].handle, 'user1');
  });

  it('classifySocialCandidates keeps included rows and tallies rejections', async () => {
    const response = JSON.stringify([
      {
        keep: true,
        id: 'x-1',
        date: '2026-05-23',
        platform: 'x',
        quote_original: 'תושבים במקלט בנהריה',
        resilience_component: 'functional_continuity',
      },
      { keep: false, id: 'x-2', reason: 'off_topic' },
    ]);
    const result = await classifySocialCandidates(
      [{ id: 'x-1', platform: 'x', text: 'תושבים במקלט', url: 'https://x.com/a/1' }],
      {
        skipBudgetCheck: true,
        skipCostLog: true,
        anthropicClient: mockAnthropicClient(response),
      },
    );
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, 'x-1');
    assert.equal(result.findings[0].resilience_component, 'functional_continuity');
    assert.equal(result.rejected.off_topic, 1);
  });

  it('classifySocialCandidates repairs malformed JSON arrays', async () => {
    const response = '[{"keep":true,"id":"x-9","date":"2026-05-23","platform":"x","quote_original":"מקלט"}]';
    const result = await classifySocialCandidates(
      [{ id: 'x-9', platform: 'x', text: 'מקלט', url: 'https://x.com/a/9' }],
      {
        skipBudgetCheck: true,
        skipCostLog: true,
        anthropicClient: mockAnthropicClient(response),
      },
    );
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].quote_original, 'מקלט');
  });
});
