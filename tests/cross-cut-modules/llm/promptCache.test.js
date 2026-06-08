import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCachedSystemFromParts,
  wrapCachedSystemString,
  prepareAnthropicRequest,
} from '../../../cross-cut-modules/llm/promptCache.js';

const ENV_KEYS = [
  'LLM_PROMPT_CACHE',
  'RESILIENCE_EXTRACT_PROMPT_CACHE',
  'RESILIENCE_ASSESS_PROMPT_CACHE',
  'CHAT_PROMPT_CACHE',
  'LLM_PROMPT_CACHE_MIN_CHARS',
];

const saved = {};

function setEnv(key, value) {
  if (!(key in saved)) saved[key] = process.env[key];
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (key in saved) process.env[key] = saved[key];
    else delete process.env[key];
  }
}

const LONG_STABLE = 'x'.repeat(3000);
const SHORT = 'short prompt';

describe('promptCache', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    setEnv('LLM_PROMPT_CACHE', '1');
    setEnv('CHAT_PROMPT_CACHE', '1');
    setEnv('RESILIENCE_EXTRACT_PROMPT_CACHE', '1');
    setEnv('LLM_PROMPT_CACHE_MIN_CHARS', '2048');
  });

  afterEach(() => restoreEnv());

  it('returns concatenated string when cache disabled', () => {
    setEnv('LLM_PROMPT_CACHE', '0');
    const out = buildCachedSystemFromParts(LONG_STABLE, 'dynamic', { feature: 'chat' });
    assert.equal(out, `${LONG_STABLE}dynamic`);
  });

  it('returns two-block array with cache_control on stable when enabled', () => {
    const out = buildCachedSystemFromParts(LONG_STABLE, 'tail', { feature: 'chat' });
    assert.ok(Array.isArray(out));
    assert.equal(out.length, 2);
    assert.equal(out[0].cache_control?.type, 'ephemeral');
    assert.equal(out[1].cache_control, undefined);
    assert.equal(out[1].text, 'tail');
  });

  it('skips cache_control when combined text below min chars', () => {
    const out = buildCachedSystemFromParts(SHORT, SHORT, { feature: 'chat' });
    assert.equal(out, `${SHORT}${SHORT}`);
  });

  it('wrapCachedSystemString caches long single block', () => {
    const out = wrapCachedSystemString(LONG_STABLE, { feature: 'extract' });
    assert.ok(Array.isArray(out));
    assert.equal(out[0].cache_control?.type, 'ephemeral');
  });

  it('prepareAnthropicRequest converts stable/dynamic object', () => {
    const prepared = prepareAnthropicRequest({
      model: 'test',
      system: { stable: LONG_STABLE, dynamic: 'ctx' },
      callContext: { feature: 'chat' },
    });
    assert.ok(Array.isArray(prepared.system));
    assert.equal(prepared.callContext.promptCacheApplied, true);
  });

  it('prepareAnthropicRequest passthrough when system already array', () => {
    const blocks = [{ type: 'text', text: 'cached' }];
    const prepared = prepareAnthropicRequest({
      system: blocks,
      callContext: { feature: 'chat' },
    });
    assert.equal(prepared.system, blocks);
    assert.equal(prepared.callContext.promptCacheApplied, true);
  });
});
