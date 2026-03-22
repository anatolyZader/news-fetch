import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createEvidenceDraftStore } from '../../../cross-cut-modules/persistence/evidenceDraftStore.js';

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
});
