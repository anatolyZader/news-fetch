import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildValidationExplainSystemPrompt,
  buildValidationExplainUserBlock,
} from '../../../../../../business_modules/resilience_scorer/analyst/validation/domain/services/validationExplainPrompt.js';

describe('validationExplainPrompt', () => {
  it('builds user block with reasons and signals', () => {
    const block = buildValidationExplainUserBlock(
      {
        reasons: [{ code: 'LOW_CONFIDENCE', component_id: 'narrative' }],
        signals: [{ signal_type: 'fear_expression', evidence: 'people afraid' }],
      },
      { article_chunks: [], similar_articles: [] },
      'Why flagged?',
    );
    assert.match(block, /LOW_CONFIDENCE/);
    assert.match(block, /fear_expression/);
    assert.match(block, /Why flagged\?/);
  });

  it('system prompt instructs no invention', () => {
    assert.match(buildValidationExplainSystemPrompt(), /Do not invent/);
  });
});
