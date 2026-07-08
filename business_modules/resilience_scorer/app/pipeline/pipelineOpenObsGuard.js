import { existsSync, readFileSync, statSync } from 'node:fs';

/**
 * True when open pipeline extract should run (missing, empty, invalid, or zero observations).
 * @param {string} path
 */
export function openPipelineObsNeedsExtract(path) {
  if (!existsSync(path)) return true;
  try {
    if (statSync(path).size === 0) return true;
    const bundle = JSON.parse(readFileSync(path, 'utf8'));
    const observations = bundle?.observations;
    return !Array.isArray(observations) || observations.length === 0;
  } catch {
    return true;
  }
}
