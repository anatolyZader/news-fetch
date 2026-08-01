import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeExternalUrl } from '../../../client/src/lib/safeExternalUrl.js';

describe('safeExternalUrl', () => {
  it('passes through http/https/mailto and relative URLs', () => {
    assert.equal(safeExternalUrl('https://example.com/a'), 'https://example.com/a');
    assert.equal(safeExternalUrl('http://example.com/a'), 'http://example.com/a');
    assert.equal(safeExternalUrl('mailto:someone@example.com'), 'mailto:someone@example.com');
    assert.equal(safeExternalUrl('/reports/today'), '/reports/today');
  });

  it('trims surrounding whitespace', () => {
    assert.equal(safeExternalUrl('  https://example.com/a  '), 'https://example.com/a');
  });

  it('rejects dangerous schemes', () => {
    assert.equal(safeExternalUrl('javascript:alert(1)'), null);
    assert.equal(safeExternalUrl('JavaScript:alert(1)'), null);
    assert.equal(safeExternalUrl('data:text/html,x'), null);
    assert.equal(safeExternalUrl('vbscript:msgbox'), null);
    assert.equal(safeExternalUrl('ftp://example.com/a'), null);
  });

  it('rejects sentinels and empty values', () => {
    assert.equal(safeExternalUrl('(no url)'), null);
    assert.equal(safeExternalUrl('null'), null);
    assert.equal(safeExternalUrl(''), null);
    assert.equal(safeExternalUrl('   '), null);
    assert.equal(safeExternalUrl(null), null);
    assert.equal(safeExternalUrl(undefined), null);
  });
});
