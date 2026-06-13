import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REDACTED, redactSecrets } from '../../../cross-cut-modules/security/domain/services/secretRedaction.js';

describe('secretRedaction', () => {
  it('redacts sensitive object keys', () => {
    const out = redactSecrets({
      apiKey: 'sk-ant-secret',
      password: 'hunter2',
      label: 'chat:tool',
    });
    assert.equal(out.apiKey, REDACTED);
    assert.equal(out.password, REDACTED);
    assert.equal(out.label, 'chat:tool');
  });

  it('redacts bearer and sk-ant patterns in strings', () => {
    const out = redactSecrets('Authorization: Bearer abc.def-123 and sk-ant-api03-xyz');
    assert.ok(!out.includes('abc.def-123'));
    assert.ok(out.includes(REDACTED));
  });

  it('deep-walks nested structures', () => {
    const out = redactSecrets({
      meta: { nested: { token: 'secret-value' } },
      items: [{ authorization: 'Bearer x' }],
    });
    assert.equal(out.meta.nested.token, REDACTED);
    assert.equal(out.items[0].authorization, REDACTED);
  });

  it('passes through primitives unchanged', () => {
    assert.equal(redactSecrets(null), null);
    assert.equal(redactSecrets(42), 42);
    assert.equal(redactSecrets(true), true);
  });
});
