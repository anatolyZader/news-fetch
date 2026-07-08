/**
 * Application service for epistemic feature computation.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { computeEpistemicProfile } from '../domain/epistemic/epistemicProfileBuilder.js';
import { epistemicProfilesDir } from '../domain/services/paths/outputDirs.js';

export function createEpistemicFeaturesService(opts = {}) {
  const profilesDir = opts.profilesDir ?? opts.reportsDir ?? epistemicProfilesDir();

  return {
    computeProfile(signals, context = {}) {
      return computeEpistemicProfile(signals, context);
    },

    persistProfile(profile, { scopeId = 'national', date }) {
      const path = join(profilesDir, `epistemic-profile-${scopeId}-${date}.json`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(profile, null, 2), 'utf8');
      return path;
    },
  };
}
