/**
 * Per-source replay reuse flags (RESILIENCE_REPLAY_REUSE_*).
 * When global replay is on (--date != today), each source may reuse cached
 * bundles (prod) or schedule full re-extract (dev default).
 */

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

const REPLAY_REUSE_ALIASES = Object.freeze({
  field: 'visits',
});

/**
 * @param {string} sourceType
 * @returns {string}
 */
export function replayReuseEnvKey(sourceType) {
  const canonical = REPLAY_REUSE_ALIASES[sourceType] ?? sourceType;
  return `RESILIENCE_REPLAY_REUSE_${String(canonical ?? '').toUpperCase().replaceAll('-', '_')}`;
}

/**
 * @param {string} sourceType
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isReplayReuseEnabled(sourceType, env = process.env) {
  const key = replayReuseEnvKey(sourceType);
  let v = env[key];
  if ((v == null || v === '') && sourceType === 'visits') {
    v = env.RESILIENCE_REPLAY_REUSE_FIELD;
  }
  if ((v == null || v === '') && sourceType === 'field') {
    v = env.RESILIENCE_REPLAY_REUSE_FIELD ?? env.RESILIENCE_REPLAY_REUSE_VISITS;
  }
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
 * @param {{ replayMode?: boolean, sourceType: string, force?: boolean, bundleExists?: boolean, env?: NodeJS.ProcessEnv }} ctx
 * @returns {boolean}
 */
export function preferReuse({ replayMode, sourceType, force, bundleExists, env = process.env }) {
  if (!bundleExists || force) return false;
  if (!replayMode) return true;
  return shouldReuseInReplay(sourceType, { replayMode, force, env });
}

/** Presets that enable per-source replay reuse when env vars are unset. */
const PRESET_DEFAULT_REPLAY_REUSE = Object.freeze({
  '8comp-north-replay': ['news', 'whatsapp', 'visits', 'pbo'],
});

/**
 * Apply preset-default replay reuse flags (only when env is unset).
 * Mutates process.env when called without a custom env object.
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
