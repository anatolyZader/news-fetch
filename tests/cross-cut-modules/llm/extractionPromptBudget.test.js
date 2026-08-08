import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXTRACT_PROMPT_VERSION,
  buildCoreExtractionSystemPrompt,
  buildCoreExtractionStablePrefix,
  coreExtractionStablePrefixCharBudget,
  LEGACY_STABLE_PREFIX_CHAR_BASELINE,
} from '../../../business_modules/resilience_scorer/domain/contracts/extractionPrompt.js';
import {
  formatSignalCatalog,
  formatDisambiguationBlock,
} from '../../../business_modules/resilience_scorer/domain/services/signals/routing/signalCatalogPrompt.js';

describe('extractionPromptBudget', () => {
  it('uses extract-v5 prompt version (invalidates extraction cache)', () => {
    // The per-article extraction cache keys on this value, so a prompt edit
    // without a bump is served from cache and silently never runs.
    // v4 added the adversative-split instruction to the field-report prefix.
    // v5 requires evidence to be verbatim in the source language.
    assert.equal(EXTRACT_PROMPT_VERSION, 'extract-v5');
  });

  it('requires evidence to be a verbatim source-language quote', () => {
    // Evidence is verified by matching it against the source body. Translated
    // evidence scores ~zero and the signal is demoted below the grounded tier —
    // silently, and in bulk, when a whole extraction pass translates.
    const stable = buildCoreExtractionStablePrefix(formatDisambiguationBlock);
    assert.match(stable, /verbatim\s+source-language quote/);
    assert.match(stable, /no translation/);
  });

  it('asks for a locality output field for geo-scope resolution', () => {
    const prompt = buildCoreExtractionSystemPrompt(formatDisambiguationBlock, formatSignalCatalog);
    assert.match(prompt, /locality/);
  });

  it('stable prefix (no catalog) is at least 25% shorter than extract-v1 baseline', () => {
    const stable = buildCoreExtractionStablePrefix(formatDisambiguationBlock);
    const budget = coreExtractionStablePrefixCharBudget();
    assert.ok(
      stable.length < budget,
      `stable prefix ${stable.length} exceeds budget ${budget} (baseline ${LEGACY_STABLE_PREFIX_CHAR_BASELINE})`,
    );
  });

  it('includes closed-vocabulary and JSON output rules', () => {
    const prompt = buildCoreExtractionSystemPrompt(formatDisambiguationBlock, formatSignalCatalog);
    assert.match(prompt, /closed vocabulary/i);
    assert.match(prompt, /JSON array/i);
    assert.match(prompt, /compliance_enter_shelter/);
  });
});
