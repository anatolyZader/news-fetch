import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  writeFileAtomic,
  writeFileAtomicSync,
} from '../../../cross-cut-modules/persistence/infrastructure/writeFileAtomic.js';

const dir = mkdtempSync(join(tmpdir(), 'atomic-'));
after(() => rmSync(dir, { recursive: true, force: true }));

describe('writeFileAtomic', () => {
  it('sync variant writes content and leaves no temp files', () => {
    const target = join(dir, 'a.json');
    writeFileAtomicSync(target, '{"v":1}');
    assert.equal(readFileSync(target, 'utf8'), '{"v":1}');
    assert.deepEqual(readdirSync(dir).filter((f) => f.includes('.tmp-')), []);
  });

  it('overwrites existing content atomically', () => {
    const target = join(dir, 'b.json');
    writeFileAtomicSync(target, 'first');
    writeFileAtomicSync(target, 'second');
    assert.equal(readFileSync(target, 'utf8'), 'second');
  });

  it('async variant writes content and cleans temps', async () => {
    const target = join(dir, 'c.json');
    await writeFileAtomic(target, 'hello');
    assert.equal(readFileSync(target, 'utf8'), 'hello');
    assert.deepEqual(readdirSync(dir).filter((f) => f.includes('.tmp-')), []);
  });

  it('throws and cleans up when the directory does not exist', () => {
    assert.throws(() => writeFileAtomicSync(join(dir, 'missing', 'x.json'), 'x'));
  });
});
