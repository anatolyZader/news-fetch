import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeMarkdownHref } from '../../../client/src/lib/safeMarkdownHref.js';

describe('isSafeMarkdownHref', () => {
  it('allows http and https', () => {
    assert.equal(isSafeMarkdownHref('https://example.com'), true);
    assert.equal(isSafeMarkdownHref('http://example.com/path'), true);
  });

  it('allows mailto and relative paths', () => {
    assert.equal(isSafeMarkdownHref('mailto:user@example.com'), true);
    assert.equal(isSafeMarkdownHref('/api/docs'), true);
    assert.equal(isSafeMarkdownHref('./page'), true);
    assert.equal(isSafeMarkdownHref('//cdn.example.com/x'), true);
  });

  it('blocks javascript, data, and vbscript', () => {
    assert.equal(isSafeMarkdownHref('javascript:alert(1)'), false);
    assert.equal(isSafeMarkdownHref('JavaScript:void(0)'), false);
    assert.equal(isSafeMarkdownHref('data:text/html,<script>'), false);
    assert.equal(isSafeMarkdownHref('vbscript:msgbox(1)'), false);
  });

  it('rejects empty href', () => {
    assert.equal(isSafeMarkdownHref(''), false);
    assert.equal(isSafeMarkdownHref('   '), false);
  });
});
