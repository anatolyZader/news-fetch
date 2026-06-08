import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveChatContextTier,
  resolveChatEconomyMode,
  chatContextTieringEnabled,
} from '../../../../business_modules/chat/domain/chatContextTier.js';

describe('chatContextTier', () => {
  it('tiering enabled by default', () => {
    const prev = process.env.CHAT_CONTEXT_TIERING;
    delete process.env.CHAT_CONTEXT_TIERING;
    assert.equal(chatContextTieringEnabled(), true);
    process.env.CHAT_CONTEXT_TIERING = '0';
    assert.equal(chatContextTieringEnabled(), false);
    if (prev === undefined) delete process.env.CHAT_CONTEXT_TIERING;
    else process.env.CHAT_CONTEXT_TIERING = prev;
  });

  it('resolves hub tier for priority questions', () => {
    const r = resolveChatContextTier('What should I focus on today?');
    assert.equal(r.tier, 'hub');
  });

  it('resolves compare tier', () => {
    const r = resolveChatContextTier('What changed since yesterday?');
    assert.equal(r.tier, 'compare');
  });

  it('resolves minimal tier for evidence questions', () => {
    const r = resolveChatContextTier('Show me the source quote for that signal');
    assert.equal(r.tier, 'minimal');
  });

  it('validation profile forces minimal', () => {
    const r = resolveChatContextTier('Tell me about leadership', { toolProfile: 'validation' });
    assert.equal(r.tier, 'minimal');
    assert.equal(r.reason, 'validation_profile');
  });

  it('resolves component tier', () => {
    const r = resolveChatContextTier('How is leadership doing?');
    assert.equal(r.tier, 'component');
    assert.equal(r.componentId, 'leadership');
  });

  it('resolves full tier for broad requests', () => {
    const r = resolveChatContextTier('Give me a summary of all components');
    assert.equal(r.tier, 'full');
  });

  it('defaults to standard tier', () => {
    const r = resolveChatContextTier('Hello, how are things?');
    assert.equal(r.tier, 'standard');
  });

  it('economy full override disables compact and forces full tier path', () => {
    const prev = process.env.CHAT_COMPACT_TOOL_LOOP;
    delete process.env.CHAT_COMPACT_TOOL_LOOP;
    const economy = resolveChatEconomyMode('anything', { economy: 'full' });
    assert.equal(economy.economyOverride, 'full');
    assert.equal(economy.forceFull, true);
    assert.equal(economy.compactToolLoop, false);
    assert.equal(economy.tieringEnabled, false);
    const tier = resolveChatContextTier('hello', { forceFull: economy.forceFull });
    assert.equal(tier.tier, 'full');
    if (prev === undefined) delete process.env.CHAT_COMPACT_TOOL_LOOP;
    else process.env.CHAT_COMPACT_TOOL_LOOP = prev;
  });
});
