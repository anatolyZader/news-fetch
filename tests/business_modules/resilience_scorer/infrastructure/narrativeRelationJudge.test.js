import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  judgeNarrativeRelations,
  formatJudgeFeedback,
} from '../../../../business_modules/resilience_scorer/infrastructure/narrativeRelationJudge.js';

function mockJudgeClient(verdictsByComponent) {
  let callIndex = 0;
  return {
    messages: {
      stream: () => {
        const verdicts = verdictsByComponent[callIndex] ?? [];
        callIndex++;
        const message = {
          content: [{
            type: 'text',
            text: JSON.stringify({ verdicts }),
          }],
          usage: { input_tokens: 50, output_tokens: 20 },
        };
        return {
          finalMessage: async () => message,
          [Symbol.asyncIterator]: async function* () {},
        };
      },
    },
  };
}

describe('narrativeRelationJudge', () => {
  beforeEach(() => {
    process.env.RESILIENCE_NARRATIVE_JUDGE_BATCH = '1';
  });

  afterEach(() => {
    delete process.env.RESILIENCE_NARRATIVE_JUDGE_BATCH;
  });

  it('uses one API call per component in batch mode', async () => {
    const client = mockJudgeClient([
      [
        { i: 0, entailed: true, invented_relation: false },
        { i: 1, entailed: false, invented_relation: true, reason: 'bad link' },
      ],
      [{ i: 0, entailed: true, invented_relation: false }],
    ]);

    const narratives = {
      components: [
        {
          component_id: 'narrative',
          narrative_claims: [
            { text: 'A', signal_refs: ['r1'], relation: 'parallel' },
            { text: 'B', signal_refs: ['r2'], relation: 'parallel' },
          ],
        },
        {
          component_id: 'leadership',
          narrative_claims: [{ text: 'C', signal_refs: ['r3'], relation: 'parallel' }],
        },
      ],
    };

    const registry = {
      byRef: new Map([
        ['r1', { signal: { evidence: 'e1' } }],
        ['r2', { signal: { evidence: 'e2' } }],
        ['r3', { signal: { evidence: 'e3' } }],
      ]),
    };

    const result = await judgeNarrativeRelations(narratives, registry, { client, skipProgress: true });
    assert.equal(result.ok, false);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].claim.text, 'B');
  });

  it('shows each evidence line its article key so shared-article checks are decidable', async () => {
    const sent = [];
    const client = {
      messages: {
        stream: (params) => {
          sent.push(params);
          return {
            finalMessage: async () => ({
              content: [{ type: 'text', text: JSON.stringify({ verdicts: [{ i: 0, invented_relation: false }] }) }],
              usage: { input_tokens: 10, output_tokens: 5 },
            }),
            [Symbol.asyncIterator]: async function* () {},
          };
        },
      },
    };

    const narratives = {
      components: [{
        component_id: 'leadership',
        narrative_claims: [{ text: 'A and B', signal_refs: ['r1', 'r2'], relation: 'same_article_only' }],
      }],
    };
    const registry = {
      byRef: new Map([
        ['r1', { signal: { evidence: 'e1', article_index: 4 } }],
        ['r2', { signal: { evidence: 'e2', article_index: 4 } }],
      ]),
    };

    const result = await judgeNarrativeRelations(narratives, registry, { client, skipProgress: true });
    assert.equal(result.ok, true);

    const userContent = sent[0].messages[0].content;
    assert.match(userContent, /"e1" \[article: idx:4\]/);
    assert.match(userContent, /"e2" \[article: idx:4\]/);
    assert.match(sent[0].system, /\[article: <key>\]/);
  });

  it('formatJudgeFeedback lists failures', () => {
    const text = formatJudgeFeedback([
      {
        component_id: 'narrative',
        claim: { text: 'bad claim' },
        verdict: { reason: 'unsupported' },
      },
    ]);
    assert.match(text, /narrative/);
    assert.match(text, /bad claim/);
  });
});
