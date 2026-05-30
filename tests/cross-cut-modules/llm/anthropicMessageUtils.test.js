import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTextFromContent,
  extractLastAssistantText,
  simplifyMessagesForDisplay,
} from '../../../cross-cut-modules/llm/anthropicMessageUtils.js';

describe('anthropicMessageUtils', () => {
  it('extractTextFromContent handles string', () => {
    assert.equal(extractTextFromContent('hello'), 'hello');
  });

  it('extractTextFromContent joins text blocks', () => {
    const content = [
      { type: 'text', text: 'Part A. ' },
      { type: 'tool_use', id: 'x', name: 'foo', input: {} },
      { type: 'text', text: 'Part B.' },
    ];
    assert.equal(extractTextFromContent(content), 'Part A. Part B.');
  });

  it('extractLastAssistantText finds last assistant string', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'first' },
      { role: 'user', content: 'more' },
      { role: 'assistant', content: [{ type: 'text', text: 'final answer' }] },
    ];
    assert.equal(extractLastAssistantText(messages), 'final answer');
  });

  it('simplifyMessagesForDisplay skips tool_result-only user turns', () => {
    const messages = [
      { role: 'user', content: 'Investigate' },
      { role: 'assistant', content: [{ type: 'tool_use', id: '1', name: 'x', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: '1', content: 'ok' }] },
      { role: 'assistant', content: 'Done investigating.' },
    ];
    const display = simplifyMessagesForDisplay(messages);
    assert.deepEqual(display, [
      { role: 'user', text: 'Investigate' },
      { role: 'assistant', text: 'Done investigating.' },
    ]);
  });
});
