import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_POLICY = {
  version: 'distance-band-2026-05-v1',
  bands: [
    { id: '0-10', maxKm: 10 },
    { id: '10-25', maxKm: 25 },
    { id: '25+', maxKm: null },
  ],
};

/**
 * @param {string} [dataDir]
 * @returns {{ version: string, bands: { id: string, maxKm: number | null }[] }}
 */
export function loadDistanceBandPolicy(dataDir) {
  try {
    const base = dataDir ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../data');
    const raw = JSON.parse(readFileSync(resolve(base, 'distance-band-policy.json'), 'utf8'));
    if (typeof raw.version === 'string' && Array.isArray(raw.bands) && raw.bands.length > 0) {
      return raw;
    }
  } catch {
    /* use default */
  }
  return DEFAULT_POLICY;
}
