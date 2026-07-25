import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveChatContextTier,
  resolveChatEconomyMode,
  chatContextSlicingEnabled,
} from '../../../../business_modules/chat/domain/chatContextTier.js';

describe('chatContextTier', () => {
  it('context slicing enabled by default', () => {
    const prev = process.env.CHAT_CONTEXT_TIERING;
    delete process.env.CHAT_CONTEXT_TIERING;
    assert.equal(chatContextSlicingEnabled(), true);
    process.env.CHAT_CONTEXT_TIERING = '0';
    assert.equal(chatContextSlicingEnabled(), false);
    if (prev === undefined) delete process.env.CHAT_CONTEXT_TIERING;
    else process.env.CHAT_CONTEXT_TIERING = prev;
  });

  it('resolves hub context_slice for priority questions', () => {
    const r = resolveChatContextTier('What should I focus on today?');
    assert.equal(r.contextSlice, 'hub');
  });

  it('resolves compare context_slice', () => {
    const r = resolveChatContextTier('What changed since yesterday?');
    assert.equal(r.contextSlice, 'compare');
  });

  it('resolves temporal context_slice over compare when anti-compare', () => {
    const r = resolveChatContextTier(
      'how information_communication changed in Kiryat Shmona throughout all dates',
    );
    assert.equal(r.contextSlice, 'temporal');
    assert.equal(r.componentId, 'information_communication');
  });

  it('resolves temporal context_slice for war-period phrasing', () => {
    const r = resolveChatContextTier(
      'how information and communication developed in Kiryat Shmona during the war?',
    );
    assert.equal(r.contextSlice, 'temporal');
    assert.equal(r.componentId, 'information_communication');
  });

  it('anti-compare blocks compare slice for all-dates phrasing', () => {
    const r = resolveChatContextTier('what changed across all dates for leadership');
    assert.notEqual(r.contextSlice, 'compare');
  });

  it('resolves minimal context_slice for evidence questions', () => {
    const r = resolveChatContextTier('Show me the source quote for that signal');
    assert.equal(r.contextSlice, 'minimal');
  });

  it('component questions resolve component slice regardless of unknown profiles', () => {
    const r = resolveChatContextTier('Tell me about leadership', { toolProfile: 'validation' });
    assert.equal(r.contextSlice, 'component');
    assert.equal(r.componentId, 'leadership');
  });

  it('resolves component context_slice', () => {
    const r = resolveChatContextTier('How is leadership doing?');
    assert.equal(r.contextSlice, 'component');
    assert.equal(r.componentId, 'leadership');
  });

  it('resolves full context_slice for broad requests', () => {
    const r = resolveChatContextTier('Give me a summary of all components');
    assert.equal(r.contextSlice, 'full');
  });

  it('defaults to standard context_slice', () => {
    const r = resolveChatContextTier('Hello, how are things?');
    assert.equal(r.contextSlice, 'standard');
  });

  it('economy full override disables compact and forces full context_slice path', () => {
    const prev = process.env.CHAT_COMPACT_TOOL_LOOP;
    delete process.env.CHAT_COMPACT_TOOL_LOOP;
    const economy = resolveChatEconomyMode('anything', { economy: 'full' });
    assert.equal(economy.economyOverride, 'full');
    assert.equal(economy.forceFull, true);
    assert.equal(economy.compactToolLoop, false);
    assert.equal(economy.contextSlicingEnabled, false);
    const slice = resolveChatContextTier('hello', { forceFull: economy.forceFull });
    assert.equal(slice.contextSlice, 'full');
    if (prev === undefined) delete process.env.CHAT_COMPACT_TOOL_LOOP;
    else process.env.CHAT_COMPACT_TOOL_LOOP = prev;
  });
});
