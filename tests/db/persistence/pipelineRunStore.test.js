import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPipelineRunStore } from '../../../db/persistence/pipelineRunStore.js';

describe('pipelineRunStore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-run-'));
  const dbPath = join(dir, 'test.sqlite');
  const store = createPipelineRunStore(dbPath);

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('records stage completion', () => {
    store.startRun({ runKey: '2026-06-02:national', reportDate: '2026-06-02', reportScopeId: 'national' });
    store.completeStage('2026-06-02:national', 'EXTRACT', { catalogVersion: 'v1' });
    const run = store.getRun('2026-06-02:national');
    assert.equal(run.stages.EXTRACT.status, 'completed');
  });
});
