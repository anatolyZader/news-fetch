import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { openPipelineObsNeedsExtract } from '../../../../../../business_modules/resilience_scorer/app/pipeline/pipelineOpenObsGuard.js';
import { pipelineOpenObservationsPath } from '../../../../../../business_modules/resilience_scorer/domain/services/paths/ingestPaths.js';
import { pipelineObservationBundleFilename } from '../../../../../../business_modules/open_observation_extraction/domain/services/observationSchema.js';

describe('openPipelineObsNeedsExtract', () => {
  it('returns true when file is missing', () => {
    assert.equal(openPipelineObsNeedsExtract('/nonexistent/observations-pipeline-news-2026-01-01.json'), true);
  });

  it('returns true when observations array is empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'open-obs-needs-'));
    try {
      const path = join(root, pipelineObservationBundleFilename('news', '2026-01-01'));
      writeFileSync(path, JSON.stringify({ observations: [] }));
      assert.equal(openPipelineObsNeedsExtract(path), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns false when observations are populated', () => {
    const root = mkdtempSync(join(tmpdir(), 'open-obs-needs-'));
    try {
      const path = join(root, pipelineObservationBundleFilename('news', '2026-01-01'));
      writeFileSync(path, JSON.stringify({
        observations: [{ evidence: 'test observation', behavioral_description: 'desc' }],
      }));
      assert.equal(openPipelineObsNeedsExtract(path), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('pipelineOpenObservationsPath resolves under open_observation_extraction data dir', () => {
    const root = mkdtempSync(join(tmpdir(), 'open-obs-path-'));
    try {
      const path = pipelineOpenObservationsPath('news', '2026-06-01', root);
      assert.ok(path.endsWith('observations-pipeline-news-2026-06-01.json'));
      assert.ok(path.includes('business_modules/open_observation_extraction/data'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
