/**
 * Incremental "today's spend" tracker over the cost-log JSONL. Instead of
 * re-parsing the whole ledger on every budget check, it remembers a byte
 * offset per file and folds in only newly appended lines — including appends
 * from other processes (workers, pipeline CLIs), which share the same files.
 *
 * BUDGET_SPEND_TRACKER_ENABLED=false makes callers fall back to full scans.
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs';

import { resolveCostLogPath } from './logPaths.js';
import { datedJsonlPath, jsonlRotationEnabled } from './rotatingJsonl.js';

export function spendTrackerEnabled() {
  return process.env.BUDGET_SPEND_TRACKER_ENABLED !== 'false';
}

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function newState(day) {
  return {
    day,
    /** @type {Map<string, number>} byte offset per file */
    offsets: new Map(),
    total: 0,
    /** @type {Map<string, number>} */
    byOwner: new Map(),
    /** @type {Map<string, number>} */
    byScript: new Map(),
  };
}

/**
 * Read complete lines appended since `offset`. Never consumes a trailing
 * partial line (no final newline yet) — that tail is picked up next call.
 * @returns {{ lines: string[], newOffset: number }}
 */
function readNewCompleteLines(filePath, offset, size) {
  const length = size - offset;
  const buf = Buffer.alloc(length);
  const fd = openSync(filePath, 'r');
  try {
    readSync(fd, buf, 0, length, offset);
  } finally {
    closeSync(fd);
  }
  const lastNewline = buf.lastIndexOf(0x0a);
  if (lastNewline === -1) return { lines: [], newOffset: offset };
  const chunk = buf.subarray(0, lastNewline + 1).toString('utf8');
  return {
    lines: chunk.split('\n').filter(Boolean),
    newOffset: offset + lastNewline + 1,
  };
}

function foldEntry(state, entry) {
  if (!entry?.timestamp?.startsWith(state.day)) return;
  const cost = typeof entry.totalCostUsd === 'number' ? entry.totalCostUsd : 0;
  state.total += cost;
  if (entry.owner_uid) {
    state.byOwner.set(entry.owner_uid, (state.byOwner.get(entry.owner_uid) ?? 0) + cost);
  }
  if (entry.script) {
    state.byScript.set(entry.script, (state.byScript.get(entry.script) ?? 0) + cost);
  }
}

function trackedPaths(basePath, day) {
  const paths = [basePath];
  if (jsonlRotationEnabled()) {
    const dated = datedJsonlPath(basePath, day);
    if (dated !== basePath) paths.push(dated);
  }
  return paths;
}

/**
 * Fold newly complete lines from one file into state.
 * @returns {'ok' | 'missing' | 'rebuild'}
 */
function ingestPath(state, path) {
  const offset = state.offsets.get(path) ?? 0;
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return offset > 0 ? 'rebuild' : 'missing';
  }
  if (size < offset) return 'rebuild';
  if (size === offset) return 'ok';
  try {
    const { lines, newOffset } = readNewCompleteLines(path, offset, size);
    for (const line of lines) {
      try {
        foldEntry(state, JSON.parse(line));
      } catch { /* torn/foreign line — skip, like readJsonlRecords does */ }
    }
    state.offsets.set(path, newOffset);
  } catch {
    /* transient read failure — retry next call */
  }
  return 'ok';
}

function createTracker() {
  /** @type {Map<string, ReturnType<typeof newState>>} independent state per base path */
  const states = new Map();

  /** Sync in-memory totals with whatever landed on disk since the last call. */
  function refresh(rootDir) {
    const today = utcToday();
    const basePath = resolveCostLogPath(rootDir);
    let state = states.get(basePath);
    if (!state || state.day !== today) {
      state = newState(today);
      states.set(basePath, state);
    }

    for (const path of trackedPaths(basePath, state.day)) {
      if (ingestPath(state, path) === 'rebuild') {
        states.delete(basePath);
        return refresh(rootDir);
      }
    }
    return state;
  }

  return {
    todaySpendTotal(rootDir) {
      return refresh(rootDir).total;
    },
    todaySpendForOwner(ownerUid, rootDir) {
      if (!ownerUid) return 0;
      return refresh(rootDir).byOwner.get(ownerUid) ?? 0;
    },
    todaySpendForScripts(scripts, rootDir) {
      const state = refresh(rootDir);
      let total = 0;
      for (const s of scripts) total += state.byScript.get(s) ?? 0;
      return total;
    },
    resetForTests() {
      states.clear();
    },
  };
}

/** @type {ReturnType<typeof createTracker> | null} */
let defaultTracker = null;

export function getCostSpendTracker() {
  if (!defaultTracker) defaultTracker = createTracker();
  return defaultTracker;
}

export function resetCostSpendTrackerForTests() {
  defaultTracker = null;
}
