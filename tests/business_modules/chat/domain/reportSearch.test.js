import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { collectReportHits, searchReports } from '../../../../business_modules/chat/domain/reportSearch.js';

const FIXTURE_REPORT = {
  assessment: {
    cross_component_synthesis: 'National mood steady; generator shortages reported in the north.',
    cross_component_synthesis_user: 'User synthesis text.',
    components: [
      {
        component_id: 'functional_continuity',
        narrative: 'DEVELOPER-ONLY narrative about generator shortages and fuel.',
        narrative_user: 'Municipal services strained by GENERATOR shortages.',
        evidence_user: ['Diesel generators sold out in Kiryat Shmona'],
        narrative_claims: [{ text: 'Claim: generator imports doubled.' }],
        manifestations_evidenced: ['generator sharing between neighbors'],
      },
      {
        component_id: 'leadership',
        narrative_user: 'Mayors held daily briefings.',
      },
    ],
  },
};

/** Compact report basename parseable by parseReportFilename (gitignored daily_reports/ absent in CI). */
function writeFixtureReportsDir(report = FIXTURE_REPORT) {
  const dir = mkdtempSync(join(tmpdir(), 'report-search-'));
  writeFileSync(join(dir, 'national-1-150726-1200.json'), JSON.stringify(report));
  return dir;
}

describe('collectReportHits', () => {
  it('finds hits in synthesis and component fields, case-insensitive', () => {
    const hits = collectReportHits(FIXTURE_REPORT, { query: 'generator' });
    const fields = hits.map((h) => `${h.component_id}/${h.field}`);
    assert.ok(fields.includes('synthesis/cross_component_synthesis'));
    assert.ok(fields.includes('functional_continuity/narrative_user'));
    assert.ok(fields.includes('functional_continuity/evidence_user'));
    assert.ok(fields.includes('functional_continuity/narrative_claims'));
    assert.ok(fields.includes('functional_continuity/manifestations_evidenced'));
    assert.ok(hits.every((h) => h.snippet.toLowerCase().includes('generator')));
  });

  it('component filter narrows and skips synthesis', () => {
    const hits = collectReportHits(FIXTURE_REPORT, { query: 'generator', component: 'leadership' });
    assert.equal(hits.length, 0);
    const hits2 = collectReportHits(FIXTURE_REPORT, { query: 'briefings', component: 'leadership' });
    assert.equal(hits2.length, 1);
    assert.equal(hits2[0].component_id, 'leadership');
  });

  it('bounds snippets to ~200 chars with ellipses', () => {
    const long = `${'x'.repeat(500)} generator ${'y'.repeat(500)}`;
    const hits = collectReportHits(
      { assessment: { components: [{ component_id: 'leadership', narrative_user: long }] } },
      { query: 'generator' },
    );
    assert.equal(hits.length, 1);
    assert.ok(hits[0].snippet.length <= 220);
    assert.match(hits[0].snippet, /^….*…$/);
  });

  it('returns nothing for empty query or missing assessment', () => {
    assert.deepEqual(collectReportHits(FIXTURE_REPORT, { query: '' }), []);
    assert.deepEqual(collectReportHits({}, { query: 'x' }), []);
  });
});

describe('searchReports', () => {
  it('requires a query', () => {
    assert.equal(searchReports({}), 'query is required.');
    assert.equal(searchReports({ query: '  ' }), 'query is required.');
  });

  it('runs against real on-disk reports without throwing', () => {
    const text = searchReports({ query: 'zzz-no-such-text-zzz', limit: 3 });
    assert.match(text, /No report text matches/);
  });

  it('applies the redact hook before searching', () => {
    const dir = writeFixtureReportsDir();
    try {
      let calls = 0;
      const redact = (_report) => {
        calls += 1;
        // Strip every text field — a correct implementation then finds nothing.
        return { assessment: { components: [] } };
      };
      const text = searchReports(
        { query: 'generator', limit: 2 },
        { redact, reportsDir: dir },
      );
      assert.ok(calls > 0, 'redact hook was never invoked');
      assert.match(text, /No report text matches/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
