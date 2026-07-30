import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySvixSignature } from '../../../cross-cut-modules/security/infrastructure/svixSignature.js';

const SECRET_BYTES = Buffer.from('test-svix-secret-material-32byte');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;
const NOW_SEC = 1_700_000_000;

function sign(body, { id = 'msg_1', timestamp = String(NOW_SEC), key = SECRET_BYTES } = {}) {
  return createHmac('sha256', key)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
}

function headersFor(body, overrides = {}) {
  const timestamp = overrides.timestamp ?? String(NOW_SEC);
  const id = overrides.id ?? 'msg_1';
  return {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': overrides.signature ?? `v1,${sign(body, { id, timestamp })}`,
  };
}

describe('verifySvixSignature', () => {
  it('accepts a valid signature', () => {
    const body = '{"type":"email.received"}';
    const result = verifySvixSignature(body, headersFor(body), SECRET, { nowSec: NOW_SEC });
    assert.deepEqual(result, { ok: true });
  });

  it('accepts the secret without the whsec_ prefix', () => {
    const body = '{"a":1}';
    const result = verifySvixSignature(
      body,
      headersFor(body),
      SECRET_BYTES.toString('base64'),
      { nowSec: NOW_SEC },
    );
    assert.equal(result.ok, true);
  });

  it('accepts when any of multiple space-delimited entries matches', () => {
    const body = '{"a":1}';
    const good = sign(body);
    const headers = headersFor(body, { signature: `v1,${Buffer.from('nope').toString('base64')} v1,${good}` });
    assert.equal(verifySvixSignature(body, headers, SECRET, { nowSec: NOW_SEC }).ok, true);
  });

  it('rejects a wrong signature', () => {
    const body = '{"a":1}';
    const headers = headersFor(body, { signature: `v1,${sign('{"a":2}')}` });
    const result = verifySvixSignature(body, headers, SECRET, { nowSec: NOW_SEC });
    assert.deepEqual(result, { ok: false, reason: 'signature_mismatch' });
  });

  it('rejects a signature made with a different key', () => {
    const body = '{"a":1}';
    const headers = headersFor(body, { signature: `v1,${sign(body, { key: Buffer.from('other-key') })}` });
    assert.equal(verifySvixSignature(body, headers, SECRET, { nowSec: NOW_SEC }).ok, false);
  });

  it('rejects timestamps outside tolerance (replay guard)', () => {
    const body = '{"a":1}';
    const stale = String(NOW_SEC - 3600);
    const headers = headersFor(body, { timestamp: stale });
    const result = verifySvixSignature(body, headers, SECRET, { nowSec: NOW_SEC });
    assert.deepEqual(result, { ok: false, reason: 'timestamp_out_of_tolerance' });
  });

  it('rejects missing signature headers and missing secret', () => {
    const body = '{"a":1}';
    assert.equal(
      verifySvixSignature(body, { 'svix-id': 'msg_1' }, SECRET, { nowSec: NOW_SEC }).reason,
      'missing_signature_headers',
    );
    assert.equal(
      verifySvixSignature(body, headersFor(body), '', { nowSec: NOW_SEC }).reason,
      'missing_secret',
    );
  });

  it('verifies over raw Buffer bodies identically to strings', () => {
    const body = '{"héb":"שלום"}';
    const headers = headersFor(body);
    assert.equal(
      verifySvixSignature(Buffer.from(body, 'utf8'), headers, SECRET, { nowSec: NOW_SEC }).ok,
      true,
    );
  });
});
