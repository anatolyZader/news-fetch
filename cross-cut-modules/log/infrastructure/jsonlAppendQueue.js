/**
 * Buffered async JSONL appends for hot-path telemetry (audit log, LLM
 * invocation log). Lines queue per file and flush on an unref'd interval —
 * one appendFile per file per tick, strictly in order. On process exit the
 * remaining buffer flushes synchronously.
 *
 * NOT for the cost log: budget enforcement needs appends durable and visible
 * to the tail-reader the moment the turn ends.
 */
import { appendFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';

import { ensureParentDir } from './jsonlLog.js';

function flushIntervalMs() {
  const n = Number.parseInt(process.env.JSONL_FLUSH_INTERVAL_MS ?? '250', 10);
  return Number.isFinite(n) && n > 0 ? n : 250;
}

function queueMaxLines() {
  const n = Number.parseInt(process.env.JSONL_QUEUE_MAX ?? '5000', 10);
  return Number.isFinite(n) && n > 0 ? n : 5000;
}

/** @type {Map<string, string[]>} */
const queues = new Map();
/** @type {NodeJS.Timeout | null} */
let timer = null;
let flushing = false;
let lastOverflowWarnAt = 0;

function ensureTimer() {
  if (timer) return;
  timer = setInterval(() => { void flushAll(); }, flushIntervalMs());
  if (typeof timer.unref === 'function') timer.unref();
}

async function flushAll() {
  if (flushing) return;
  flushing = true;
  try {
    for (const [filePath, lines] of queues) {
      if (lines.length === 0) continue;
      const batch = lines.splice(0, lines.length);
      try {
        ensureParentDir(filePath);
        await appendFile(filePath, `${batch.join('\n')}\n`, 'utf8');
      } catch {
        // Put the batch back at the front so order is preserved for retry.
        lines.unshift(...batch);
      }
    }
  } finally {
    flushing = false;
  }
}

/**
 * @param {string} filePath
 * @param {string} line JSON-serialized record (no trailing newline)
 */
export function enqueueJsonlAppend(filePath, line) {
  let lines = queues.get(filePath);
  if (!lines) {
    lines = [];
    queues.set(filePath, lines);
  }
  lines.push(line);
  const max = queueMaxLines();
  if (lines.length > max) {
    lines.splice(0, lines.length - max);
    const now = Date.now();
    if (now - lastOverflowWarnAt > 60_000) {
      lastOverflowWarnAt = now;
      console.warn(`[jsonlAppendQueue] overflow on ${filePath} — oldest lines dropped (cap ${max})`);
    }
  }
  ensureTimer();
}

/** Synchronous drain for shutdown/crash paths. */
export function flushJsonlQueuesSync() {
  for (const [filePath, lines] of queues) {
    if (lines.length === 0) continue;
    const batch = lines.splice(0, lines.length);
    try {
      ensureParentDir(filePath);
      appendFileSync(filePath, `${batch.join('\n')}\n`, 'utf8');
    } catch { /* nothing left to do on the way down */ }
  }
}

export function jsonlQueueDepth() {
  let depth = 0;
  for (const lines of queues.values()) depth += lines.length;
  return depth;
}

export function resetJsonlQueueForTests() {
  queues.clear();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

process.on('exit', flushJsonlQueuesSync);
