/**
 * Per-source replay reuse flags (`RESILIENCE_REPLAY_REUSE_*`).
 *
 * Pipeline position: STAGE-1 replay orchestration — when global replay is on
 * (`--date != today`), each source may reuse cached bundles or schedule re-extract.
 *
 * Owns: env key naming, per-source reuse checks, preset-default env seeding.
 * Does NOT: resolve top-level ingest policy (see `pipelineIngestPolicy.js`) or
 * run extract.
 *
 * Key collaborators: `pipeline/pipelineIngestPolicy.js`, `app/pipeline/pipelineOrchestrator.js`,
 * 8comp replay presets.
 */

// ---------------------------------------------------------------------------
// Source types and env keys
// ---------------------------------------------------------------------------

/** Source types that support per-source replay reuse env flags. */
export const REPLAY_REUSE_SOURCE_TYPES = Object.freeze([
  'news',
  'radio',
  'whatsapp',
  'visits',
  'pbo',
  'naftali',
  'social',
  'pbo_regional',
]);

/**
 * Env var name for a source type's replay reuse flag.
 * @param {string} sourceType
 * @returns {string}
 */
export function replayReuseEnvKey(sourceType) {
  return `RESILIENCE_REPLAY_REUSE_${String(sourceType ?? '').toUpperCase().replaceAll('-', '_')}`;
}

// ---------------------------------------------------------------------------
// Reuse decision helpers
// ---------------------------------------------------------------------------

/**
 * Whether a source's replay reuse env flag is explicitly enabled.
 * @param {string} sourceType
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isReplayReuseEnabled(sourceType, env = process.env) {
  const key = replayReuseEnvKey(sourceType);
  const v = env[key];
  if (v == null || v === '') return false;
  return v === '1' || v === 'true' || v === 'on';
}

/**
 * True when replay should reuse cached artifacts instead of full re-extract.
 * @param {string} sourceType
 * @param {{ replayMode?: boolean, force?: boolean, env?: NodeJS.ProcessEnv }} ctx
 * @returns {boolean}
 */
export function shouldReuseInReplay(sourceType, { replayMode, force, env = process.env }) {
  if (!replayMode || force) return false;
  return isReplayReuseEnabled(sourceType, env);
}

/**
 * Prefer reuse when a bundle exists and replay policy allows it.
 * @param {{ replayMode?: boolean, sourceType: string, force?: boolean, bundleExists?: boolean, env?: NodeJS.ProcessEnv }} ctx
 * @returns {boolean}
 */
export function preferReuse({ replayMode, sourceType, force, bundleExists, env = process.env }) {
  if (!bundleExists || force) return false;
  if (!replayMode) return true;
  return shouldReuseInReplay(sourceType, { replayMode, force, env });
}

// ---------------------------------------------------------------------------
// Preset defaults
// ---------------------------------------------------------------------------

/** Presets that enable per-source replay reuse when env vars are unset. */
const PRESET_DEFAULT_REPLAY_REUSE = Object.freeze({
  '8comp-north-replay': ['news', 'whatsapp', 'visits', 'pbo'],
});

/**
 * Apply preset-default replay reuse flags (only when env is unset).
 * Mutates `process.env` when called without a custom env object.
 * @param {string|null|undefined} presetName
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]} source types enabled by this call
 */
export function applyDefaultReplayReuseEnv(presetName, env = process.env) {
  const sources = PRESET_DEFAULT_REPLAY_REUSE[String(presetName ?? '').trim()] ?? [];
  const enabled = [];
  for (const sourceType of sources) {
    const key = replayReuseEnvKey(sourceType);
    if (env[key] == null || env[key] === '') {
      env[key] = '1';
      enabled.push(sourceType);
    }
  }
  return enabled;
}
