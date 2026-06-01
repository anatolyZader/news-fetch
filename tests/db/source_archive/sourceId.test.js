import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMdSourceId,
  buildArchiveSourceId,
  parseMdSourceId,
  ensureSourceId,
} from '../../../db/source_archive/sourceId.js';

describe('sourceId', () => {
  it('buildMdSourceId is stable', () => {
    assert.equal(
      buildMdSourceId('articles-homefront-2026-01-01.md', 3),
      'md:articles-homefront-2026-01-01.md#3',
    );
  });

  it('buildArchiveSourceId is stable for same url', () => {
    const a = buildArchiveSourceId({
      source_type: 'audio',
      date: '2026-01-01',
      source_url: 'https://youtube.com/watch?v=abc',
    });
    const b = buildArchiveSourceId({
      source_type: 'audio',
      date: '2026-01-01',
      source_url: 'https://youtube.com/watch?v=abc',
    });
    assert.equal(a, b);
  });

  it('parseMdSourceId round-trips', () => {
    const parsed = parseMdSourceId('md:path/to/file.md#2');
    assert.deepEqual(parsed, { sourceFile: 'path/to/file.md', idx1: 2 });
  });

  it('ensureSourceId uses md opts', () => {
    const id = ensureSourceId(
      { date: '2026-01-01', source_type: 'news', body: 'x' },
      { mdPath: 'foo.md', mdIndex: 1 },
    );
    assert.equal(id, 'md:foo.md#1');
  });
});
