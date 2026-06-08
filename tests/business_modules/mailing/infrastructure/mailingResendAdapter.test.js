import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailingResendAdapter } from '../../../../business_modules/mailing/infrastructure/adapters/mailingResendAdapter.js';

async function mockResendSuccessFetch(_url, _init) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ id: 're_123' }),
  };
}

async function mockResend422Fetch() {
  return {
    ok: false,
    status: 422,
    text: async () => JSON.stringify({ message: 'Invalid from address' }),
  };
}

test('createMailingResendAdapter throws without api key', () => {
  assert.throws(() => createMailingResendAdapter({ apiKey: '' }), /apiKey is required/);
});

test('sendTransactional posts JSON and returns id on success', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return mockResendSuccessFetch(url, init);
  };
  const adapter = createMailingResendAdapter({ apiKey: 're_test', fetchImpl });
  const out = await adapter.sendTransactional({
    from: 'T <t@example.com>',
    to: 'u@example.com',
    subject: 'Hi',
    text: 'Body',
    headers: { 'X-Entity-Ref-ID': 'digest-1' },
  });
  assert.equal(out.id, 're_123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.method, 'POST');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.to, ['u@example.com']);
  assert.equal(body.subject, 'Hi');
  assert.deepEqual(body.headers, { 'X-Entity-Ref-ID': 'digest-1' });
});

test('sendTransactional throws with Resend error message on 422', async () => {
  const adapter = createMailingResendAdapter({ apiKey: 're_test', fetchImpl: mockResend422Fetch });
  await assert.rejects(
    () => adapter.sendTransactional({
      from: 'bad',
      to: 'u@example.com',
      subject: 'S',
      text: 'T',
    }),
    /Invalid from address/,
  );
});
