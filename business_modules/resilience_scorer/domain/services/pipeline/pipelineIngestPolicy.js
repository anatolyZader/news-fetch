/**
 * Ingest reuse policies for run-pipeline / 8comp variants.
 *
 * Pipeline position: STAGE-1 orchestration — decides whether a source re-extracts
 * or reuses an existing bundle before assess loads signals.
 *
 * Owns: ingest policy resolution (`refresh` | `reuse-first` | `always-reextract`)
 * and bundle reuse gate used by pipeline orchestrator.
 * Does NOT: set per-source env flags (see `replayReuseConfig.js`) or run extract.
 *
 * Key collaborators: `pipeline/replayReuseConfig.js`, `app/pipeline/pipelineOrchestrator.js`,
 * `app/pipeline/pipelineIngestPlan.js`.
 */

import { preferReuse } from './replayReuseConfig.js';

/** @typedef {'refresh' | 'reuse-first' | 'always-reextract'} IngestPolicy */

// ---------------------------------------------------------------------------
// Policy constants
// ---------------------------------------------------------------------------

/** Allowed ingest policy values for CLI and orchestrator validation. */
export const INGEST_POLICIES = Object.freeze(['refresh', 'reuse-first', 'always-reextract']);

/** Env flag holding visits back from `always-reextract` (on unless explicitly set to 0). */
export const VISITS_REEXTRACT_HOLD_ENV_KEY = 'RESILIENCE_VISITS_REEXTRACT_HOLD';

/**
 * Whether visits are held back from `always-reextract` (`--reextract`, 8comp *-north presets).
 * Held by default: visit report .md files are static between field rounds, so a full
 * re-extract only re-spends LLM budget on unchanged input. Set the env key to `0`
 * once new visits bundles land.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isVisitsReextractHeld(env = process.env) {
  const v = env[VISITS_REEXTRACT_HOLD_ENV_KEY];
  if (v == null || v === '') return true;
  return !(v === '0' || v === 'false' || v === 'off');
}

// ---------------------------------------------------------------------------
// Policy resolution
// ---------------------------------------------------------------------------

/**
 * Resolve effective ingest policy from CLI flags, scope, and replay mode.
 * @param {{ ingestPolicy?: IngestPolicy|null, alwaysReextract?: boolean, scope?: string, replayMode?: boolean }} ctx
 * @returns {IngestPolicy}
 */
export function resolveIngestPolicy(ctx) {
  const {
    ingestPolicy = null,
    alwaysReextract = false,
    scope = 'national',
    replayMode = false,
  } = ctx;

  if (alwaysReextract || ingestPolicy === 'always-reextract') return 'always-reextract';
  if (ingestPolicy && INGEST_POLICIES.includes(ingestPolicy)) return ingestPolicy;
  if (!replayMode && scope === 'national') return 'refresh';
  return 'reuse-first';
}

/**
 * Whether an existing bundle should be reused under the resolved ingest policy.
 * @param {{
 *   ingestPolicy: IngestPolicy,
 *   replayMode?: boolean,
 *   sourceType: string,
 *   force?: boolean,
 *   bundleExists?: boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} ctx
 * @returns {boolean}
 */
export function shouldReuseBundle(ctx) {
  const {
    ingestPolicy,
    replayMode = false,
    sourceType,
    force = false,
    bundleExists = false,
    env = process.env,
  } = ctx;

  if (!bundleExists || force) return false;
  if (ingestPolicy === 'always-reextract') {
    return sourceType === 'visits' && isVisitsReextractHeld(env);
  }
  if (ingestPolicy === 'refresh' && !replayMode) return false;
  return preferReuse({ replayMode, sourceType, force, bundleExists, env });
}

/**
 * Whether PBO should always re-extract under the given policy.
 * @param {IngestPolicy} ingestPolicy
 * @returns {boolean}
 */
export function wantsAlwaysReextractPbo(ingestPolicy) {
  return ingestPolicy === 'always-reextract';
}
