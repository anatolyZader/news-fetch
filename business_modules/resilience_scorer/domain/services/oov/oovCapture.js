/**
 * Capture out-of-vocabulary (oov) signal suggestions for catalog evolution.
 *
 * Pipeline position: STAGE-1 extract and STAGE-2 assess — appends learning captures
 * to JSONL and buffers in-memory records for the current run.
 *
 * Owns: capture enable flags, JSONL append, run buffer, daily capture counts.
 * Does NOT: cluster captures (see `dynamicOovCluster.js`) or synthesize scoring
 * signals (see `oovScoringSignals.js`).
 *
 * Key collaborators: `paths/outputDirs.js` (captures dir), `contracts/learningCaptureKinds.js`,
 * extract/assess runners.
 */

import { resolve } from 'node:path';
import { resolveStateStore } from '../../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';
import { envFlagOn, envFlagOff } from '../../../../../cross-cut-modules/config/envFlags.js';
import { resilienceCapturesDir } from '../paths/outputDirs.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

/**
 * Whether OOV learning capture is enabled (`RESILIENCE_OOV_CAPTURE` defaults on).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isLearningCaptureEnabled(env = process.env) {
  return env.RESILIENCE_OOV_CAPTURE !== '0';
}

/**
 * Opt-in residual LLM pass for articles that yielded zero scored signals.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isResidualCaptureEnabled(env = process.env) {
  if (envFlagOff(env, 'RESILIENCE_RESIDUAL_CAPTURE')) return false;
  if (envFlagOn(env, 'RESILIENCE_RESIDUAL_CAPTURE')) return true;
  if (envFlagOff(env, 'RESILIENCE_OMISSION_AUDIT')) return false;
  const omission = env.RESILIENCE_OMISSION_AUDIT;
  if (omission == null || omission === '') return true;
  return envFlagOn(env, 'RESILIENCE_OMISSION_AUDIT');
}

// ---------------------------------------------------------------------------
// Persistence and run buffer
// ---------------------------------------------------------------------------

/** @type {Array<object>} in-memory buffer for current run */
let runBuffer = [];

/**
 * Append a capture record to the daily JSONL file (no-op when capture disabled).
 * @param {object} record
 * @param {string} [capturesDir]
 */
export function appendOovCapture(record, capturesDir = resilienceCapturesDir()) {
  if (!isLearningCaptureEnabled()) return;
  const dir = resolve(capturesDir);
  getStore().mkdirSync(dir, { recursive: true });
  const date = record.timestamp?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const path = resolve(dir, `oov-capture-${date}.jsonl`);
  getStore().appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
}

/**
 * Buffer a capture for the current run and persist to JSONL.
 * @param {object} record
 */
export function bufferOovCapture(record) {
  runBuffer.push(record);
  appendOovCapture(record);
}

/**
 * Clear the in-memory run buffer and return the flushed count.
 * @returns {number}
 */
export function flushOovRunBuffer() {
  const n = runBuffer.length;
  runBuffer = [];
  return n;
}

/**
 * Current in-memory capture count for the active run.
 * @returns {number}
 */
export function getOovRunCount() {
  return runBuffer.length;
}

/**
 * Shallow copy of in-memory captures for the current run.
 * @returns {Array<object>}
 */
export function getOovRunBuffer() {
  return [...runBuffer];
}

/**
 * Count JSONL lines in today's (or given date's) OOV capture file.
 * @param {string} date YYYY-MM-DD
 * @param {string} [capturesDir]
 * @returns {number}
 */
export function countOovCapturesForDate(date, capturesDir = resilienceCapturesDir()) {
  if (!isLearningCaptureEnabled()) return 0;
  const path = resolve(capturesDir, `oov-capture-${date}.jsonl`);
  if (!getStore().existsSync(path)) return 0;
  try {
    const text = getStore().readFileSync(path, 'utf8');
    return text.split('\n').filter((line) => line.trim()).length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export {LEARNING_CAPTURE_KINDS} from '../../contracts/learningCaptureKinds.js';
