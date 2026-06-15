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

/**
 * Decision-trace artifact path. Defaults to repo-root `logs/traces` so traces sit
 * alongside the slash-command `pipeline-run-*.log` files; override with RESILIENCE_TRACE_DIR.
 * @param {string} basename e.g. extract-news-2026-06-15-0843 (no extension)
 * @returns {string}
 */
export function resolveRunTracePath(basename) {
  const env = process.env.RESILIENCE_TRACE_DIR?.trim();
  let dir;
  if (!env) {
    dir = join(process.cwd(), 'logs', 'traces');
  } else if (isAbsolute(env)) {
    dir = env;
  } else {
    dir = join(process.cwd(), env);
  }
  return join(dir, basename);
}
