import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  enqueueJsonlAppend,
  flushJsonlQueuesSync,
  jsonlQueueDepth,
  resetJsonlQueueForTests,
} from '../../../cross-cut-modules/log/infrastructure/jsonlAppendQueue.js';

const dir = mkdtempSync(join(tmpdir(), 'appendq-'));
after(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => resetJsonlQueueForTests());

describe('jsonlAppendQueue', () => {
  it('flushes buffered lines in order', async () => {
    process.env.JSONL_FLUSH_INTERVAL_MS = '20';
    try {
      const file = join(dir, 'a.jsonl');
      enqueueJsonlAppend(file, '{"n":1}');
      enqueueJsonlAppend(file, '{"n":2}');
      assert.equal(jsonlQueueDepth(), 2);
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(readFileSync(file, 'utf8'), '{"n":1}\n{"n":2}\n');
      assert.equal(jsonlQueueDepth(), 0);
    } finally {
      delete process.env.JSONL_FLUSH_INTERVAL_MS;
    }
  });

  it('flushJsonlQueuesSync drains immediately', () => {
    const file = join(dir, 'b.jsonl');
    enqueueJsonlAppend(file, '{"n":1}');
    assert.equal(existsSync(file), false);
    flushJsonlQueuesSync();
    assert.equal(readFileSync(file, 'utf8'), '{"n":1}\n');
    assert.equal(jsonlQueueDepth(), 0);
  });

  it('drops oldest lines beyond the cap', () => {
    process.env.JSONL_QUEUE_MAX = '3';
    try {
      const file = join(dir, 'c.jsonl');
      for (let i = 1; i <= 5; i += 1) enqueueJsonlAppend(file, `{"n":${i}}`);
      flushJsonlQueuesSync();
      assert.equal(readFileSync(file, 'utf8'), '{"n":3}\n{"n":4}\n{"n":5}\n');
    } finally {
      delete process.env.JSONL_QUEUE_MAX;
    }
  });
});
