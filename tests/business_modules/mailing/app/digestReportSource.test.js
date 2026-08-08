import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createDigestReportSource } from '../../../../business_modules/mailing/app/digestReportSource.js';

function fakePort() {
  const calls = { latest: [], cached: [] };
  return {
    calls,
    getLatestGeneratedReport: (store, opts) => {
      calls.latest.push({ store, opts });
      return { reportDate: '2026-04-03' };
    },
    getCachedReport: (store, opts) => {
      calls.cached.push({ store, opts });
      return { reportDate: '2026-05-23' };
    },
  };
}

function spyLog() {
  const lines = [];
  return { lines, log: (m) => lines.push(m) };
}

describe('createDigestReportSource', () => {
  const store = { marker: 'evidence-store' };

  it('reads the newest-generated north report by default', () => {
    const port = fakePort();
    const { log } = spyLog();
    const read = createDigestReportSource({ reportReadPort: port, evidenceStore: store, env: {}, log });

    assert.strictEqual(read()?.reportDate, '2026-04-03');
    assert.strictEqual(port.calls.cached.length, 0);
    assert.deepStrictEqual(port.calls.latest[0], { store, opts: { scope: 'north' } });
  });

  it('uses date-based selection when asked', () => {
    const port = fakePort();
    const { log } = spyLog();
    const read = createDigestReportSource({
      reportReadPort: port,
      evidenceStore: store,
      env: { MAIL_DIGEST_REPORT_SELECTION: 'latest_date', MAIL_DIGEST_REPORT_SCOPE: 'national' },
      log,
    });

    assert.strictEqual(read()?.reportDate, '2026-05-23');
    assert.strictEqual(port.calls.latest.length, 0);
    assert.deepStrictEqual(port.calls.cached[0], { store, opts: { scope: 'national' } });
  });

  it('logs the resolved source exactly once, at construction', () => {
    const { lines, log } = spyLog();
    const read = createDigestReportSource({ reportReadPort: fakePort(), env: {}, log });

    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], /scope=north/);
    assert.match(lines[0], /selection=latest_generated/);

    for (let i = 0; i < 5; i += 1) read();
    assert.strictEqual(lines.length, 1);
  });

  it('makes a coerced scope visible in the log and on the config', () => {
    const { lines, log } = spyLog();
    const read = createDigestReportSource({
      reportReadPort: fakePort(),
      env: { MAIL_DIGEST_REPORT_SCOPE: 'nroth' },
      log,
    });

    assert.match(lines[0], /scope=national \(COERCED from "nroth"\)/);
    assert.strictEqual(read.config.scopeCoerced, true);
  });

  it('requires a report read port', () => {
    assert.throws(() => createDigestReportSource({ env: {}, log: () => {} }), /reportReadPort/);
  });
});
