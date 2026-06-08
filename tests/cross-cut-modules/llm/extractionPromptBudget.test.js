import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXTRACT_PROMPT_VERSION,
  buildCoreExtractionSystemPrompt,
  buildCoreExtractionStablePrefix,
  coreExtractionStablePrefixCharBudget,
  LEGACY_STABLE_PREFIX_CHAR_BASELINE,
} from '../../../cross-cut-modules/resilience-contracts/extractionPrompt.js';
import {
  formatSignalCatalog,
  formatDisambiguationBlock,
} from '../../../business_modules/resilience/domain/services/signalCatalogPrompt.js';

describe('extractionPromptBudget', () => {
  it('uses extract-v2 prompt version (invalidates extraction cache)', () => {
    assert.equal(EXTRACT_PROMPT_VERSION, 'extract-v2');
  });

  it('stable prefix (no catalog) is at least 25% shorter than extract-v1 baseline', () => {
    const stable = buildCoreExtractionStablePrefix(formatDisambiguationBlock);
    assert.ok(stable.length < coreExtractionStablePrefixCharBudget(), {
      message: `stable prefix ${stable.length} exceeds budget ${coreExtractionStablePrefixCharBudget()} (baseline ${LEGACY_STABLE_PREFIX_CHAR_BASELINE})`,
    });
  });

  it('includes closed-vocabulary and JSON output rules', () => {
    const prompt = buildCoreExtractionSystemPrompt(formatDisambiguationBlock, formatSignalCatalog);
    assert.match(prompt, /closed vocabulary/i);
    assert.match(prompt, /JSON array/i);
    assert.match(prompt, /compliance_enter_shelter/);
  });
});
