/**
 * Application service for epistemic feature computation.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { computeEpistemicProfile } from '../domain/services/epistemicProfileBuilder.js';

export function createEpistemicFeaturesService(opts = {}) {
  const reportsDir = opts.reportsDir ?? 'daily_reports';

  return {
    computeProfile(signals, context = {}) {
      return computeEpistemicProfile(signals, context);
    },

    persistProfile(profile, { scopeId = 'national', date }) {
      const path = join(reportsDir, `epistemic-profile-${scopeId}-${date}.json`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(profile, null, 2), 'utf8');
      return path;
    },
  };
}
