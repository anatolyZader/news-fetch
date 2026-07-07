/**
 * Load historical evidence_mass series from persisted epistemic profiles.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import { epistemicProfilesDir } from '../../domain/services/artifactPaths.js';

/**
 * @param {string} reportDate YYYY-MM-DD
 * @param {string} [profilesDir]
 * @param {number} [days]
 * @param {string} [scopeId]
 * @returns {Record<string, number[]>}
 */
export function loadHistoricalEpistemicMass(
  reportDate,
  profilesDir = epistemicProfilesDir(),
  days = 14,
  scopeId = 'national',
) {
  const out = Object.fromEntries(COMPONENT_IDS.map((id) => [id, []]));
  const prefix = `epistemic-profile-${scopeId}-`;
  let files;
  try {
    files = readdirSync(profilesDir).filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  } catch {
    return out;
  }

  const candidates = files
    .map((f) => {
      const date = f.slice(prefix.length, -'.json'.length);
      return { date, path: join(profilesDir, f) };
    })
    .filter(({ date }) => date < reportDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days);

  for (const { path } of candidates) {
    if (!existsSync(path)) continue;
    try {
      const profile = JSON.parse(readFileSync(path, 'utf8'));
      for (const id of COMPONENT_IDS) {
        const mass = profile?.by_component?.[id]?.evidence_mass;
        if (typeof mass === 'number' && Number.isFinite(mass)) {
          out[id].push(mass);
        }
      }
    } catch {
      // skip corrupt profile
    }
  }

  return out;
}
