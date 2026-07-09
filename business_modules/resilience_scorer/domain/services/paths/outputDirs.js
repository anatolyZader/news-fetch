/**
 * Canonical filesystem paths for resilience assessment output artifacts.
 */
import { resolve, isAbsolute } from 'node:path';
import { resolveRepoRoot } from './repoRoot.js';

/** Resilience report JSON/MD outputs; overridable via REPORTS_DIR. */
export function resilienceReportsDir(rootDir) {
  const fromEnv = process.env.REPORTS_DIR?.trim();
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(resolveRepoRoot(rootDir), fromEnv);
  }
  return resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/data/daily_reports');
}

export function resilienceCapturesDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/data/oov_captures');
}

export function resilienceAuditsDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/data/omission_audits');
}

/** Epistemic profile JSON snapshots (computeEpistemicProfile output). */
export function epistemicProfilesDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/data/epistemic_profiles');
}
