import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  getCachedReport,
  getLatestGeneratedReport,
  pickLatestGeneratedEdition,
} from '../../../../business_modules/resilience_scorer/index.js';
import { resetReportFileCacheForTests } from '../../../../business_modules/resilience_scorer/infrastructure/reportFileCache.js';

/** Compact filename: `{scope}-{days}-{DDMMYY}-{HHmm}`. */
function compactName(scope, ddmmyy, hhmm, ext = 'json') {
  return `${scope}-1-${ddmmyy}-${hhmm}.${ext}`;
}

function writeReport(dir, name, { generatedAt, articles = 10 } = {}) {
  writeFileSync(join(dir, name), JSON.stringify({
    ...(generatedAt ? { generated_at: generatedAt } : {}),
    assessment: { total_articles_analyzed: articles, components: [] },
  }));
}

describe('getLatestGeneratedReport', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'res-latest-gen-'));
    resetReportFileCacheForTests();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    resetReportFileCacheForTests();
  });

  it('picks newest generated_at while getCachedReport picks newest report date', () => {
    // Replay of an old period, regenerated recently.
    writeReport(dir, compactName('north', '030426', '0940'), { generatedAt: '2026-08-07T09:40:00.000Z' });
    // Newer period, generated back when it was current.
    writeReport(dir, compactName('north', '230526', '1215'), { generatedAt: '2026-05-23T12:15:00.000Z' });

    const byGenerated = getLatestGeneratedReport(null, { scope: 'north', reportsDir: dir });
    const byDate = getCachedReport(null, { scope: 'north', reportsDir: dir });

    // Asserting both in one test documents the whole point of the helper: if
    // someone "fixes" selection back to date ordering, this fails loudly.
    assert.strictEqual(byGenerated?.reportDate, '2026-04-03');
    assert.strictEqual(byDate?.reportDate, '2026-05-23');
  });

  it('returns null when the directory holds no reports for the scope', () => {
    assert.strictEqual(getLatestGeneratedReport(null, { scope: 'north', reportsDir: dir }), null);
  });

  it('falls back to newest date when no edition has a generated_at', () => {
    // runId '0000' is rejected by the synthesizer, so generated_at stays null.
    writeReport(dir, compactName('north', '030426', '0000'));
    writeReport(dir, compactName('north', '230526', '0000'));

    const picked = getLatestGeneratedReport(null, { scope: 'north', reportsDir: dir });
    assert.strictEqual(picked?.reportDate, '2026-05-23');
  });

  it('prefers a dated edition over one with no timestamp, even when older-dated', () => {
    writeReport(dir, compactName('north', '030426', '0940'), { generatedAt: '2026-08-07T09:40:00.000Z' });
    writeReport(dir, compactName('north', '230526', '0000'));

    const picked = getLatestGeneratedReport(null, { scope: 'north', reportsDir: dir });
    assert.strictEqual(picked?.reportDate, '2026-04-03');
  });

  it('keeps the newer report date when generated_at ties exactly', () => {
    const tie = '2026-08-07T09:40:00.000Z';
    writeReport(dir, compactName('north', '030426', '0940'), { generatedAt: tie });
    writeReport(dir, compactName('north', '230526', '1215'), { generatedAt: tie });

    const picked = getLatestGeneratedReport(null, { scope: 'north', reportsDir: dir });
    assert.strictEqual(picked?.reportDate, '2026-05-23');
  });

  it('does not cross scopes', () => {
    writeReport(dir, compactName('north', '030426', '0940'), { generatedAt: '2026-04-03T09:40:00.000Z' });
    writeReport(dir, compactName('national', '230526', '1215'), { generatedAt: '2026-08-07T12:15:00.000Z' });

    const north = getLatestGeneratedReport(null, { scope: 'north', reportsDir: dir });
    const national = getLatestGeneratedReport(null, { scope: 'national', reportsDir: dir });

    assert.strictEqual(north?.reportDate, '2026-04-03');
    assert.strictEqual(national?.reportDate, '2026-05-23');
  });

  it('does not let an older markdown-only edition displace a newer JSON one', () => {
    writeReport(dir, compactName('north', '230526', '1215'), { generatedAt: '2026-05-23T12:15:00.000Z' });
    // No sibling JSON → markdown-only payload, generated_at synthesized from runId.
    writeFileSync(join(dir, compactName('north', '030426', '0940', 'md')), '# North replay\n');

    const picked = getLatestGeneratedReport(null, { scope: 'north', reportsDir: dir });
    assert.strictEqual(picked?.reportDate, '2026-05-23');
    assert.notEqual(picked?.assessment?.markdown_only, true);
  });

  it('can select a markdown-only edition when it is the newest generated', () => {
    writeReport(dir, compactName('north', '030426', '0940'), { generatedAt: '2026-04-03T09:40:00.000Z' });
    writeFileSync(join(dir, compactName('north', '230526', '1215', 'md')), '# North markdown only\n');

    const picked = getLatestGeneratedReport(null, { scope: 'north', reportsDir: dir });
    assert.strictEqual(picked?.reportDate, '2026-05-23');
    assert.strictEqual(picked?.assessment?.markdown_only, true);
  });
});

describe('pickLatestGeneratedEdition', () => {
  it('returns null for an empty or non-array input', () => {
    assert.strictEqual(pickLatestGeneratedEdition([]), null);
    assert.strictEqual(pickLatestGeneratedEdition(undefined), null);
  });

  it('keeps the first entry when it is already the newest generated', () => {
    const editions = [
      { date: '2026-05-23', run_id: '1215', generated_at: '2026-08-09T00:00:00.000Z' },
      { date: '2026-04-03', run_id: '0940', generated_at: '2026-08-07T09:40:00.000Z' },
    ];
    assert.strictEqual(pickLatestGeneratedEdition(editions).date, '2026-05-23');
  });

  it('reaches past the first entry for a later generated_at', () => {
    const editions = [
      { date: '2026-05-23', run_id: '1215', generated_at: '2026-05-23T12:15:00.000Z' },
      { date: '2026-04-03', run_id: '0940', generated_at: '2026-08-07T09:40:00.000Z' },
      { date: '2026-03-25', run_id: '0800', generated_at: '2026-03-25T08:00:00.000Z' },
    ];
    assert.strictEqual(pickLatestGeneratedEdition(editions).date, '2026-04-03');
  });
});
