/**
 * Persists shadow scoring and divergence artifacts to daily_reports.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {object} params
 */
export function writeShadowArtifacts(params) {
  const {
    reportsDir = 'daily_reports',
    scopeId = 'national',
    date,
    shadowScored,
    divergence,
  } = params;

  mkdirSync(reportsDir, { recursive: true });

  const scoresPath = join(reportsDir, `shadow-scores-${scopeId}-${date}.json`);
  writeFileSync(scoresPath, JSON.stringify({ date, scopeId, scored: shadowScored }, null, 2));

  const divPath = join(reportsDir, `divergence-${scopeId}-${date}.json`);
  writeFileSync(divPath, JSON.stringify({ date, scopeId, ...divergence }, null, 2));

  return { scoresPath, divPath, base: join(reportsDir, `${scopeId}-${date}`) };
}
