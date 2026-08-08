import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { rewritePersistedReport } from '../../../../business_modules/resilience_scorer/app/reports/rewritePersistedReport.js';

function seedReport(body = { assessment: { date: '2026-04-01' } }) {
  const dir = mkdtempSync(join(tmpdir(), 'rewrite-report-'));
  const path = join(dir, 'north-1-data-2026-04-01-produced-2026-08-01T1146Z.json');
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  return { dir, path };
}

describe('rewritePersistedReport', () => {
  it('archives the original before the canonical file changes', () => {
    const { dir, path } = seedReport();
    const original = readFileSync(path, 'utf8');

    const result = rewritePersistedReport(path, (r) => ({ ...r, added: true }));

    assert.equal(result.changed, true);
    assert.ok(result.archivedPath);
    assert.equal(readFileSync(result.archivedPath, 'utf8'), original);
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).added, true);
    assert.deepEqual(readdirSync(join(dir, 'archive')).length, 1);
  });

  it('does not archive or write when the mutation is a no-op', () => {
    const { dir, path } = seedReport();
    const original = readFileSync(path, 'utf8');

    const result = rewritePersistedReport(path, (r) => r);

    assert.equal(result.changed, false);
    assert.equal(result.reason, 'identical');
    assert.equal(readFileSync(path, 'utf8'), original);
    assert.equal(existsSync(join(dir, 'archive')), false);
  });

  it('leaves the file untouched on a dry run', () => {
    const { dir, path } = seedReport();
    const original = readFileSync(path, 'utf8');

    const result = rewritePersistedReport(path, (r) => ({ ...r, added: true }), { dryRun: true });

    assert.equal(result.changed, true);
    assert.equal(result.reason, 'dry_run');
    assert.equal(readFileSync(path, 'utf8'), original);
    assert.equal(existsSync(join(dir, 'archive')), false);
  });

  it('reports a missing report rather than creating one', () => {
    const { dir } = seedReport();
    const missing = join(dir, 'not-a-report.json');
    const result = rewritePersistedReport(missing, (r) => r);
    assert.deepEqual(result, { changed: false, archivedPath: null, reason: 'missing' });
    assert.equal(existsSync(missing), false);
  });

  it('propagates a mutation error without touching the report', () => {
    const { path } = seedReport();
    const original = readFileSync(path, 'utf8');
    assert.throws(() => rewritePersistedReport(path, () => { throw new Error('boom'); }), /boom/);
    assert.equal(readFileSync(path, 'utf8'), original);
  });
});
