import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunTrace } from '../../../cross-cut-modules/log/app/runTrace.js';

const tmpDir = mkdtempSync(join(tmpdir(), 'runtrace-'));

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('createRunTrace', () => {
  it('finish() writes both .jsonl and .md', () => {
    const outBase = join(tmpDir, 'extract-news-2026-06-15');
    const trace = createRunTrace({ run: 'extract', sourceType: 'news', date: '2026-06-15', outBase, enabled: true });

    trace.item({
      source_type: 'news',
      article: { title: 'T', source: 'S', url: 'u', source_id: 'id' },
      raw_text: 'body',
      raw_text_len: 4,
      signals: [{ signal_type: 'service_continuity', evidence: 'e', confidence: 0.5, status: 'kept', dropped_by: null }],
    });
    trace.event('rejected', { batch: 'b', items: [{ text: 't', why: 'w' }] });

    const out = trace.finish();
    assert.ok(out);
    assert.ok(existsSync(out.jsonlPath));
    assert.ok(existsSync(out.mdPath));

    const jsonlLines = readFileSync(out.jsonlPath, 'utf8').trim().split('\n');
    assert.equal(jsonlLines.length, 2);
    assert.equal(JSON.parse(jsonlLines[0]).type, 'item');
    assert.equal(JSON.parse(jsonlLines[1]).type, 'rejected');

    const md = readFileSync(out.mdPath, 'utf8');
    assert.match(md, /Extraction decision trace/);
  });

  it('is a no-op when disabled', () => {
    const outBase = join(tmpDir, 'disabled-run');
    const trace = createRunTrace({ run: 'extract', outBase, enabled: false });
    trace.item({ article: {}, signals: [] });
    const out = trace.finish();

    assert.equal(out, null);
    assert.equal(existsSync(`${outBase}.jsonl`), false);
    assert.equal(existsSync(`${outBase}.md`), false);
  });
});
