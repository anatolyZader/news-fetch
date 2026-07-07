/**
 * Persists shadow scoring and divergence artifacts to analyst/data/shadow.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { analystShadowDir } from '../domain/services/artifactPaths.js';

/**
 * @param {object} params
 */
export function writeShadowArtifacts(params) {
  const {
    shadowDir = analystShadowDir(),
    scopeId = 'national',
    date,
    shadowScored,
    divergence,
  } = params;

  mkdirSync(shadowDir, { recursive: true });

  const scoresPath = join(shadowDir, `shadow-scores-${scopeId}-${date}.json`);
  writeFileSync(scoresPath, JSON.stringify({ date, scopeId, scored: shadowScored }, null, 2));

  const divPath = join(shadowDir, `divergence-${scopeId}-${date}.json`);
  writeFileSync(
    divPath,
    JSON.stringify({ date, scopeId, generated_at: divergence?.generated_at ?? new Date().toISOString(), ...divergence }, null, 2),
  );

  return { scoresPath, divPath, base: join(shadowDir, `${scopeId}-${date}`) };
}
