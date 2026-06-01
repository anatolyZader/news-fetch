import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildArticleIndexSourceIdMap, attachSourceIdsToSignals } from '../../../db/source_archive/attachSourceIds.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('attachSourceIds', () => {
  it('maps global article_index to md source_id across files', () => {
    const dir = join(tmpdir(), `attach-src-${process.pid}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const md1 = join(dir, 'a.md');
    const md2 = join(dir, 'b.md');
    writeFileSync(md1, `# Site articles (2026-01-01)\n\n## 1. First\n\n**URL:** https://a/1\n\nBody one.\n\n## 2. Second\n\n**URL:** https://a/2\n\nBody two.\n`);
    writeFileSync(md2, `# Site articles (2026-01-01)\n\n## 1. Third\n\n**URL:** https://b/1\n\nBody three.\n`);

    const map = buildArticleIndexSourceIdMap([md1, md2], dir);
    assert.equal(map.size, 3);
    assert.ok(map.get(1)?.includes('a.md#1'));
    assert.ok(map.get(3)?.includes('b.md#1'));

    const signals = attachSourceIdsToSignals(
      [{ article_index: 2, evidence: 'x' }, { article_index: 3, evidence: 'y' }],
      [md1, md2],
      dir,
    );
    assert.ok(signals[0].source_id);
    assert.ok(signals[1].source_id);

    rmSync(dir, { recursive: true, force: true });
  });
});
