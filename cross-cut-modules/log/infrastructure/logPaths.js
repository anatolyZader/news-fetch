import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Runtime log artifacts (cost JSONL, pipeline text logs). */
export function defaultLogDataDir() {
  return resolve(moduleRoot, 'data');
}

/**
 * @param {string} [rootDir] Repository root for relative COST_LOG_PATH
 * @returns {string}
 */
export function resolveCostLogPath(rootDir = process.cwd()) {
  const env = process.env.COST_LOG_PATH?.trim();
  if (!env) return join(defaultLogDataDir(), 'cost-log.jsonl');
  return isAbsolute(env) ? env : join(rootDir, env);
}

/**
 * @param {string} basename e.g. pipeline-cron.log or pipeline-2026-05-29.log
 * @returns {string}
 */
export function resolvePipelineLogPath(basename) {
  return join(defaultLogDataDir(), basename);
}
