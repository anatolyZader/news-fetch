import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createEvidenceDraftStore } from '../../../db/persistence/evidenceDraftStore.js';

describe('evidenceDraftStore', () => {
  const dbPath = join(tmpdir(), `evidence-draft-test-${Date.now()}.sqlite`);
  const store = createEvidenceDraftStore(dbPath);

  after(() => {
    try {
      if (existsSync(dbPath)) unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it('returns empty for unknown owner', () => {
    const row = store.get('no-such-user');
    assert.strictEqual(row.content, '');
    assert.strictEqual(row.updatedAt, null);
  });

  it('saves and loads round-trip', () => {
    store.save('user-a', 'hello https://example.com');
    const row = store.get('user-a');
    assert.strictEqual(row.content, 'hello https://example.com');
    assert.ok(row.updatedAt);
  });

  it('upserts same owner', () => {
    store.save('user-b', 'one');
    store.save('user-b', 'two');
    assert.strictEqual(store.get('user-b').content, 'two');
  });

  it('stores a submitted evidence item with category', () => {
    const submission = store.submit(
      'user-c',
      'https://example.com/article',
      'url_to_important_evidence',
      'https://example.com/article',
    );
    assert.ok(submission.id > 0);
    assert.strictEqual(submission.ownerKey, 'user-c');
    assert.strictEqual(submission.rawContent, 'https://example.com/article');
    assert.strictEqual(submission.content, 'https://example.com/article');
    assert.strictEqual(submission.category, 'url_to_important_evidence');
    assert.strictEqual(submission.detectedUrl, 'https://example.com/article');
    assert.ok(submission.createdAt);
  });

  it('updates ingest status for a stored submission', () => {
    const submission = store.submit('user-d', 'plain note', 'single_evidence_piece', null);
    store.setSubmissionIngestStatus({
      submissionId: submission.id,
      ownerKey: 'user-d',
      status: 'processed',
      details: 'inserted=1',
    });
    assert.ok(submission.id > 0);
  });

  it('stores analysis status and payload metadata for a submission', () => {
    const submission = store.submit('user-e', 'manual evidence text', 'single_evidence_piece', null);
    store.setSubmissionAnalysisResult({
      submissionId: submission.id,
      ownerKey: 'user-e',
      status: 'processed',
      details: 'signals=3; items=1',
      analysisJson: { version: 1, overall_resilience_score: 5.5 },
    });
    assert.ok(submission.id > 0);
    const loaded = store.getSubmissionById({ submissionId: submission.id, ownerKey: 'user-e' });
    assert.strictEqual(loaded?.analysisStatus, 'processed');
    assert.strictEqual(loaded?.ingestStatus, 'queued');
    assert.strictEqual(loaded?.analysisJson?.overall_resilience_score, 5.5);
  });
});
