import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDisplayText, resolveActionTitle, resolveActionWhyNow } from '../../../client/src/lib/resolveDisplayText.js';

const t = (key) => ({ 'action.test': 'Test title', 'why.test': 'Why now' }[key] ?? key);

describe('resolveDisplayText', () => {
  it('resolves i18n kind', () => {
    assert.equal(resolveDisplayText({ kind: 'i18n', key: 'action.test' }, t), 'Test title');
  });

  it('resolves text kind with original preference', () => {
    const field = { kind: 'text', value: 'Translated', original: 'Original' };
    assert.equal(resolveDisplayText(field, t), 'Translated');
    assert.equal(resolveDisplayText(field, t, { preferOriginal: true }), 'Original');
  });

  it('resolveActionTitle uses title object', () => {
    const action = { title: { kind: 'i18n', key: 'action.test' } };
    assert.equal(resolveActionTitle(action, t), 'Test title');
  });

  it('resolveActionWhyNow prefers free-form text', () => {
    const action = { why_now_text: 'Brief rationale', why_now_key: 'why.test' };
    assert.equal(resolveActionWhyNow(action, t), 'Brief rationale');
  });
});
