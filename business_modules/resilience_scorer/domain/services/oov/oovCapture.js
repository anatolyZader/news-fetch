/**
 * Capture out-of-vocabulary signal suggestions for catalog evolution.
 */
import { resolve } from 'node:path';
import { resolveStateStore } from '../../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';
import { resilienceCapturesDir } from '../paths/outputDirs.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isLearningCaptureEnabled(env = process.env) {
  return env.RESILIENCE_OOV_CAPTURE !== '0';
}

/**
 * Opt-in residual LLM pass for articles that yielded zero scored signals.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isResidualCaptureEnabled(env = process.env) {
  if (env.RESILIENCE_RESIDUAL_CAPTURE === '0'
    || env.RESILIENCE_RESIDUAL_CAPTURE === 'false'
    || env.RESILIENCE_RESIDUAL_CAPTURE === 'off') {
    return false;
  }
  const v = env.RESILIENCE_RESIDUAL_CAPTURE;
  if (v === '1' || v === 'true' || v === 'on') return true;
  const omission = env.RESILIENCE_OMISSION_AUDIT;
  if (omission === '0' || omission === 'false' || omission === 'off') return false;
  if (omission == null || omission === '') return true;
  return omission === '1' || omission === 'true' || omission === 'on';
}

/**
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

/** @type {Array<object>} in-memory buffer for current run */
let runBuffer = [];

export function bufferOovCapture(record) {
  runBuffer.push(record);
  appendOovCapture(record);
}

export function flushOovRunBuffer() {
  const n = runBuffer.length;
  runBuffer = [];
  return n;
}

export function getOovRunCount() {
  return runBuffer.length;
}

/** @returns {Array<object>} shallow copy of in-memory captures for current run */
export function getOovRunBuffer() {
  return [...runBuffer];
}

/**
 * Count JSONL lines in today's (or given date's) OOV capture file.
 * @param {string} date YYYY-MM-DD
 * @param {string} [capturesDir]
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

export {LEARNING_CAPTURE_KINDS} from '../../../../../cross-cut-modules/learningCapture/kinds.js';