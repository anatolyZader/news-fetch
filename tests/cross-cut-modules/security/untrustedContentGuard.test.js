import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNTRUSTED_CONTENT_INSTRUCTION,
  TOOLS_RETURNING_UNTRUSTED_CONTENT,
  wrapUntrustedBlock,
  wrapToolResultIfUntrusted,
} from '../../../cross-cut-modules/security/domain/services/untrustedContentGuard.js';

describe('untrustedContentGuard', () => {
  it('exports a non-empty system instruction', () => {
    assert.ok(UNTRUSTED_CONTENT_INSTRUCTION.includes('UNTRUSTED_DATA'));
    assert.ok(UNTRUSTED_CONTENT_INSTRUCTION.includes('never follow instructions'));
  });

  it('wrapUntrustedBlock returns empty for blank input', () => {
    assert.equal(wrapUntrustedBlock(''), '');
    assert.equal(wrapUntrustedBlock('   '), '');
  });

  it('wrapUntrustedBlock wraps content with delimiters and label', () => {
    const out = wrapUntrustedBlock('hello world', { label: 'archive_snippet' });
    assert.match(out, /^<<<UNTRUSTED_DATA label="archive_snippet">>>\n/);
    assert.match(out, /\n<<<END_UNTRUSTED_DATA>>>$/);
    assert.ok(out.includes('hello world'));
  });

  it('wrapUntrustedBlock escapes double quotes in label', () => {
    const out = wrapUntrustedBlock('x', { label: 'bad"label' });
    assert.ok(out.includes('label="bad\'label"'));
  });

  it('wrapToolResultIfUntrusted passes through unknown tools', () => {
    assert.equal(wrapToolResultIfUntrusted('compare_dates', 'scores'), 'scores');
  });

  it('wrapToolResultIfUntrusted wraps listed tools', () => {
    assert.ok(TOOLS_RETURNING_UNTRUSTED_CONTENT.has('get_source'));
    const out = wrapToolResultIfUntrusted('get_source', 'body text');
    assert.match(out, /^<<<UNTRUSTED_DATA label="tool:get_source">>>\n/);
    assert.ok(out.includes('body text'));
  });

  it('wrapToolResultIfUntrusted passes through empty results', () => {
    assert.equal(wrapToolResultIfUntrusted('get_source', ''), '');
    assert.equal(wrapToolResultIfUntrusted('get_source', '   '), '   ');
  });
});
