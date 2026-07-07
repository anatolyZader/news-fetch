import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { proposeComponentTuningFromReportFiles } from '../../../../../analyst/tuning/domain/componentTuningProposal.js';

function writeReport(dir, name, components) {
  writeFileSync(
    join(dir, name),
    JSON.stringify({ assessment: { components } }),
  );
}

describe('componentTuningProposal', () => {
  it('returns skipped advisory when report count is below threshold', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tuning-reports-'));
    writeReport(dir, 'resilience-report-2026-05-01.json', [{
      component_id: 'services',
      score: 7,
      evidence_mass: 4,
      net_evidence: 1.2,
      certainty: 0.7,
    }]);

    const result = proposeComponentTuningFromReportFiles(dir, { minReports: 3 });
    assert.equal(result.status, 'advisory_only');
    assert.equal(result.report_count, 1);
    assert.match(result.skipped_reason, /need_at_least_3/);
    assert.deepEqual(result.components, {});
  });

  it('proposes tanhK and certM medians from enough national reports', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tuning-reports-'));
    for (let i = 0; i < 6; i += 1) {
      writeReport(dir, `resilience-report-2026-05-0${i + 1}.json`, [{
        component_id: 'services',
        score: 6 + (i % 3),
        evidence_mass: 4 + i * 0.1,
        net_evidence: 1 + i * 0.05,
        certainty: 0.55 + i * 0.03,
      }]);
    }

    const result = proposeComponentTuningFromReportFiles(dir, { minReports: 5 });
    assert.equal(result.status, 'advisory_only');
    assert.equal(result.report_count, 6);
    assert.ok(result.components.services);
    assert.equal(result.components.services.n_rows, 6);
    assert.ok(result.components.services.proposed.tanhK != null || result.components.services.n_K_samples < 5);
  });

  it('ignores north regional reports and corrupt files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tuning-reports-'));
    writeFileSync(join(dir, 'resilience-report-2026-05-01-north-national.json'), '{}');
    writeFileSync(join(dir, 'resilience-report-2026-05-02.json'), '{not json');

    const result = proposeComponentTuningFromReportFiles(dir, { minReports: 2 });
    assert.equal(result.report_count, 1);
    assert.deepEqual(result.components, {});
  });
});
