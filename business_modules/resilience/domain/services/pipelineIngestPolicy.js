/**
 * Ingest reuse policies for run-pipeline / 8comp variants.
 */
import { preferReuse } from './replayReuseConfig.js';

/** @typedef {'refresh' | 'reuse-first' | 'always-reextract'} IngestPolicy */

export const INGEST_POLICIES = Object.freeze(['refresh', 'reuse-first', 'always-reextract']);

/**
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
  if (ingestPolicy === 'always-reextract') return false;
  if (ingestPolicy === 'refresh' && !replayMode) return false;
  return preferReuse({ replayMode, sourceType, force, bundleExists, env });
}

/**
 * @param {IngestPolicy} ingestPolicy
 * @returns {boolean}
 */
export function wantsAlwaysReextractPbo(ingestPolicy) {
  return ingestPolicy === 'always-reextract';
}
