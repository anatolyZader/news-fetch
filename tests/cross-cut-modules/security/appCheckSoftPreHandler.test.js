import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  appCheckSoftPreHandler,
  setAppCheckSoftMetricsPort,
} from '../../../cross-cut-modules/security/input/appCheckPreHandler.js';
import { buildReadAuthHook } from '../../../cross-cut-modules/auth/buildAuthHooks.js';
import { createInProcessMetricsPort } from '../../../cross-cut-modules/monitoring/infrastructure/adapters/inProcessMetricsPort.js';

function mockReply() {
  const send = mock.fn((_body) => undefined);
  const code = mock.fn(() => ({ send }));
  return { code, send };
}

describe('appCheckSoftPreHandler', () => {
  /** @type {string | undefined} */
  let prevEnforce;

  beforeEach(() => {
    prevEnforce = process.env.APP_CHECK_ENFORCE;
    setAppCheckSoftMetricsPort(createInProcessMetricsPort());
  });

  afterEach(() => {
    if (prevEnforce === undefined) delete process.env.APP_CHECK_ENFORCE;
    else process.env.APP_CHECK_ENFORCE = prevEnforce;
    setAppCheckSoftMetricsPort(null);
  });

  it('no-ops when APP_CHECK_ENFORCE is not true', async () => {
    process.env.APP_CHECK_ENFORCE = 'false';
    const request = { headers: {} };
    const reply = mockReply();
    await appCheckSoftPreHandler(request, reply, { route: 'test' });
    assert.strictEqual(request.appCheckStatus, undefined);
    assert.strictEqual(reply.code.mock.calls.length, 0);
  });

  it('allows missing header and sets appCheckStatus missing', async () => {
    process.env.APP_CHECK_ENFORCE = 'true';
    const request = { headers: {} };
    const reply = mockReply();
    await appCheckSoftPreHandler(request, reply, { route: 'report_today' });
    assert.strictEqual(request.appCheckStatus, 'missing');
    assert.strictEqual(reply.code.mock.calls.length, 0);
  });
});

describe('buildReadAuthHook', () => {
  /** @type {string | undefined} */
  let prevEnforce;

  beforeEach(() => {
    prevEnforce = process.env.APP_CHECK_ENFORCE;
  });

  afterEach(() => {
    if (prevEnforce === undefined) delete process.env.APP_CHECK_ENFORCE;
    else process.env.APP_CHECK_ENFORCE = prevEnforce;
  });

  it('includes soft App Check preHandler when enforce is true', () => {
    process.env.APP_CHECK_ENFORCE = 'true';
    const hook = buildReadAuthHook(true);
    assert.strictEqual(hook.preHandler?.length, 2);
  });

  it('JWT only when enforce is false', () => {
    process.env.APP_CHECK_ENFORCE = 'false';
    const hook = buildReadAuthHook(true);
    assert.strictEqual(hook.preHandler?.length, 1);
  });
});
