import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  runOfflineSmoke,
  parseVerifyArgs,
} from '../../../cross-cut-modules/llm/input/verifyPromptOptimizationInput.js';
import { formatPromptOptimizationFlags } from '../../../cross-cut-modules/llm/promptOptimizationFlags.js';

describe('promptOptimizationVerify', () => {
  it('parseVerifyArgs defaults to offline smoke', () => {
    const flags = parseVerifyArgs(['node', 'script.js']);
    assert.equal(flags.offline, true);
    assert.equal(flags.live, false);
    assert.equal(flags.showFlags, false);
  });

  it('parseVerifyArgs handles --audit and --flags', () => {
    assert.equal(parseVerifyArgs(['node', 'x', '--flags']).showFlags, true);
    assert.equal(parseVerifyArgs(['node', 'x', '--audit', '2026-06-08']).audit, '2026-06-08');
    assert.equal(parseVerifyArgs(['node', 'x', '--live']).live, true);
  });

  it('formatPromptOptimizationFlags lists cache and chat flags', () => {
    const text = formatPromptOptimizationFlags();
    assert.match(text, /LLM_PROMPT_CACHE/);
    assert.match(text, /CHAT_COMPRESS_TOOLS/);
    assert.match(text, /Quality escape hatches/);
  });

  it('runOfflineSmoke passes with mock gateway tool loop', async () => {
    const { ok, report, rows } = await runOfflineSmoke();
    assert.equal(ok, true);
    assert.ok(rows.length >= 2);
    assert.ok(rows.some((r) => r.promptCacheApplied === true));
    assert.ok(report.by_feature.chat?.rounds[1]?.cachedRead > 0);
  });
});
