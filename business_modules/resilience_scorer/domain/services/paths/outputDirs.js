/**
 * Canonical filesystem paths for resilience assessment output artifacts.
 *
 * Pipeline position: STAGE-2 assess finalize — report JSON/MD, OOV captures,
 * omission audits, and epistemic profile snapshots land under these dirs.
 *
 * Owns: output directory resolvers (reports, captures, audits, epistemic profiles,
 * developer shadow artifacts).
 * Does NOT: write artifacts (app/infrastructure adapters do), parse report names
 * (see `reportNames.js`), or ingest signal bundles.
 *
 * Key collaborators: `paths/repoRoot.js`, `paths/reportNames.js`,
 * `app/assessment/assessSignalsCli.js`, specialist shadow eval adapters.
 */

import { resolve, isAbsolute } from 'node:path';
import { resolveRepoRoot } from './repoRoot.js';

// ---------------------------------------------------------------------------
// Primary assessment outputs
// ---------------------------------------------------------------------------

/**
 * Resilience report JSON/MD outputs; overridable via `REPORTS_DIR`.
 * @param {string} [rootDir]
 * @returns {string}
 */
export function resilienceReportsDir(rootDir) {
  const fromEnv = process.env.REPORTS_DIR?.trim();
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : resolve(resolveRepoRoot(rootDir), fromEnv);
  }
  return resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/data/daily_reports');
}

/**
 * OOV learning-capture JSONL directory (catalog-evolution feedback).
 * @param {string} [rootDir]
 * @returns {string}
 */
export function resilienceCapturesDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/data/oov_captures');
}

/**
 * Omission-audit artifact directory (closed-core interim mode).
 * @param {string} [rootDir]
 * @returns {string}
 */
export function resilienceAuditsDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/data/omission_audits');
}

/**
 * Epistemic profile JSON snapshots (`computeEpistemicProfile` output).
 * @param {string} [rootDir]
 * @returns {string}
 */
export function epistemicProfilesDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/data/epistemic_profiles');
}

/**
 * Cross-report critique artifacts (post-hoc user QA over finished reports).
 * @param {string} [rootDir]
 * @returns {string}
 */
export function resilienceCritiquesDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/data/critiques');
}

// ---------------------------------------------------------------------------
// Developer / shadow eval tooling
// ---------------------------------------------------------------------------

/**
 * Developer shadow-scoring artifact directory.
 * Consumed by `specialist_agents/infrastructure/adapters/shadowArtifactsFileAdapter.js`.
 * @param {string} [rootDir]
 * @returns {string}
 */
export function developerShadowDir(rootDir) {
  return resolve(resolveRepoRoot(rootDir), 'business_modules/resilience_scorer/developer/data/shadow');
}

/**
 * Shadow-scoring divergence artifact for a scope and date.
 * @param {string} scope
 * @param {string} date YYYY-MM-DD
 * @param {string} [rootDir]
 * @returns {string}
 */
export function divergenceArtifactPath(scope, date, rootDir) {
  return resolve(developerShadowDir(rootDir), `divergence-${scope}-${date}.json`);
}
