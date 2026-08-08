import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createEvidenceDraftStore } from '../../../db/persistence/evidenceDraftStore.js';
import {
  canRunEvidenceLlmAnalysis,
  recordEvidenceLlmAnalysis,
} from '../../../business_modules/evidence_submission/input/evidenceAnalysisAccess.js';

describe('evidenceAnalysisQuota sqlite', () => {
  let dbPath;
  let store;

  beforeEach(() => {
    const root = join(tmpdir(), `ev-quota-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    dbPath = join(root, 'app.sqlite');
    store = createEvidenceDraftStore(dbPath);
    process.env.EVIDENCE_ANALYSIS_DAILY_LIMIT = '2';
  });

  afterEach(() => {
    delete process.env.EVIDENCE_ANALYSIS_DAILY_LIMIT;
    rmSync(dirname(dbPath), { recursive: true, force: true });
  });

  it('persists daily analysis count per owner', () => {
    const request = { user: { uid: 'user-a', email: 'user@example.com' } };
    assert.equal(canRunEvidenceLlmAnalysis(request, store), true);
    recordEvidenceLlmAnalysis(request, store);
    recordEvidenceLlmAnalysis(request, store);
    assert.equal(canRunEvidenceLlmAnalysis(request, store), false);
    assert.equal(store.getDailyAnalysisCount('user-a', new Date().toISOString().slice(0, 10)), 2);
  });
});
