import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { runValidationAgent } from '../../../../../business_modules/resilience/validation/app/validationReviewAgent.js';

function fakeClient(script) {
  let callIndex = 0;
  return {
    messages: {
      create: async () => {
        const step = script[callIndex] ?? script[script.length - 1];
        callIndex++;
        return step;
      },
    },
  };
}

const mockItem = {
  article_key: 'url:https://example.com/x',
  article_url: 'https://example.com/x',
  reasons: [{ code: 'oov_suggested' }],
  signals: [{ evidence: 'sample' }],
};

const mockRag = { similar_articles: [{ title: 'Similar', snippet: 'text' }] };

function mockValidationService() {
  return {
    async getItemContext() {
      return { item: mockItem, rag: mockRag };
    },
  };
}

describe('runValidationAgent', () => {
  let prevEnv;

  beforeEach(() => {
    prevEnv = {
      VALIDATION_AGENT_ENABLED: process.env.VALIDATION_AGENT_ENABLED,
      VALIDATION_EXPLAIN_ENABLED: process.env.VALIDATION_EXPLAIN_ENABLED,
      VALIDATION_REVIEW_RAG_ENABLED: process.env.VALIDATION_REVIEW_RAG_ENABLED,
    };
    process.env.VALIDATION_AGENT_ENABLED = '1';
    process.env.VALIDATION_EXPLAIN_ENABLED = '1';
    process.env.VALIDATION_REVIEW_RAG_ENABLED = '1';
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(prevEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('returns answer after tool round when last content is block array', async () => {
    const client = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 't1', name: 'get_validation_context', input: {} },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'This item was flagged due to OOV signal.' }],
      },
    ]);

    const result = await runValidationAgent({
      validationReviewService: mockValidationService(),
      date: '2026-05-30',
      scope: 'national',
      articleKey: mockItem.article_key,
      messages: [],
      client,
    });

    assert.equal(result.answer, 'This item was flagged due to OOV signal.');
    assert.ok(Array.isArray(result.messages));
    assert.ok(result.messages.length >= 2);
  });

  it('captures recommendation from propose_decision tool', async () => {
    const client = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 't2',
            name: 'propose_decision',
            input: { action: 'skip', rationale: 'Low salience OOV' },
          },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Recommend skip.' }],
      },
    ]);

    const result = await runValidationAgent({
      validationReviewService: mockValidationService(),
      date: '2026-05-30',
      scope: 'national',
      articleKey: mockItem.article_key,
      messages: [],
      client,
    });

    assert.deepEqual(result.recommendation, {
      action: 'skip',
      rationale: 'Low salience OOV',
    });
    assert.equal(result.answer, 'Recommend skip.');
  });

  it('returns error when agent disabled', async () => {
    process.env.VALIDATION_AGENT_ENABLED = '0';
    const result = await runValidationAgent({
      validationReviewService: mockValidationService(),
      date: '2026-05-30',
      scope: 'national',
      articleKey: mockItem.article_key,
      messages: [],
      client: fakeClient([]),
    });
    assert.match(result.error ?? '', /disabled/i);
  });
});
