import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPboReportRegionalFsAdapter } from '../../../../../business_modules/pbo_report_regional/infrastructure/adapters/pboReportRegionalFsAdapter.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'pbo-regional-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('regional PBO FS adapter lists markdown reports by frontmatter region', () => {
  withTempDir((dir) => {
    writeFileSync(
      join(dir, '2026-05-03-north.md'),
      [
        '---',
        'region: naftali',
        'date: 2026-05-03',
        'title: Naftali daily PBO report',
        '---',
        '# Naftali status',
        '',
        'Residents are following instructions.',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(join(dir, 'golan-2026-05-03.md'), '# Golan status\n\nSeparate report.', 'utf8');

    const adapter = createPboReportRegionalFsAdapter({ dataDir: dir });
    const reports = adapter.listReports({
      regionId: 'naftali',
      inboxDir: dir,
      allowedRegionIds: ['naftali', 'golan', 'baram', 'hiram', 'galma'],
    });

    assert.equal(reports.length, 1);
    assert.equal(reports[0].file, '2026-05-03-north.md');
    assert.equal(reports[0].regionId, 'naftali');
    assert.equal(reports[0].date, '2026-05-03');
    assert.equal(reports[0].title, 'Naftali daily PBO report');
    assert.match(reports[0].content, /Residents are following instructions/);
    assert.doesNotMatch(reports[0].content, /region: naftali/);
  });
});

test('regional PBO FS adapter infers region and date from filename', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, '2026-05-02-hiram.md'), '# Hiram report\n\nStable situation.', 'utf8');

    const adapter = createPboReportRegionalFsAdapter({ dataDir: dir });
    const reports = adapter.listReports({
      regionId: 'hiram',
      inboxDir: dir,
      allowedRegionIds: ['naftali', 'golan', 'baram', 'hiram', 'galma'],
    });

    assert.equal(reports.length, 1);
    assert.equal(reports[0].date, '2026-05-02');
    assert.equal(reports[0].title, 'Hiram report');
    assert.equal(reports[0].inboxPath, 'data/2026-05-02-hiram.md');
  });
});
