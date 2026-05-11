import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import XLSX from 'xlsx';

test('visits input converts squad visit spreadsheet to markdown source data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'visits-input-'));
  const xlsxPath = join(dir, 'visits.xlsx');
  const outputPath = join(dir, 'articles-field-reports-2026-03-15.md');

  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([
      {
        date: '2026-03-15',
        team: 'squad one',
        municipality: 'Baram',
        region: 'North',
        stakeholders: 'community manager',
        'expert analysis': 'Need protected education space. Volunteers are active.',
      },
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Visits');
    XLSX.writeFile(wb, xlsxPath);

    execFileSync('node', [
      resolve('business_modules/visits/input/visitsInput.js'),
      '--file',
      xlsxPath,
      '--output',
      outputPath,
    ], { cwd: resolve('.'), stdio: 'pipe' });

    const markdown = readFileSync(outputPath, 'utf8');
    assert.match(markdown, /# Field-reports articles \(2026-03-15\)/);
    assert.match(markdown, /Professional squad visits to municipalities/);
    assert.match(markdown, /## 1\. Baram — North/);
    assert.match(markdown, /- \*\*Source:\*\* squad one/);
    assert.match(markdown, /גורמים שנפגשו: community manager/);
    assert.match(markdown, /Need protected education space\. Volunteers are active\./);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
