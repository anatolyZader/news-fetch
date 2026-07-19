/**
 * Named presets for /8comp* slash commands and cron.
 */
import { resolveIngestPolicy } from '../../domain/services/pipeline/pipelineIngestPolicy.js';

/** @typedef {{ days: number, scope: string, alwaysReextract?: boolean, ingestPolicy?: import('../../domain/services/pipeline/pipelineIngestPolicy.js').IngestPolicy|null }} PipelinePreset */

/** @type {Record<string, PipelinePreset>} */
export const PIPELINE_PRESETS = Object.freeze({
  '8comp': { days: 1, scope: 'national' },
  /** Dated replay: reuse bundles + closed-core assess + omission audit (branch default). */
  '8comp-north-replay': { days: 1, scope: 'north' },
  /** Full re-extract every run — use for fresh bundles or cron, not routine replay. */
  '8comp-north': { days: 1, scope: 'north', alwaysReextract: true },
  '8comp-3': { days: 3, scope: 'national' },
  '8comp-3-north': { days: 3, scope: 'north', alwaysReextract: true },
  '8comp-7': { days: 14, scope: 'national' },
  '8comp-7-north': { days: 14, scope: 'north' },
});

/**
 * @param {string} name
 * @returns {PipelinePreset|null}
 */
export function getPipelinePreset(name) {
  const key = String(name ?? '').trim();
  return PIPELINE_PRESETS[key] ?? null;
}

/**
 * Merge preset defaults with explicit CLI overrides (explicit wins).
 * @param {PipelinePreset|null} preset
 * @param {{ days?: number, scope?: string, alwaysReextract?: boolean, replayMode?: boolean }} overrides
 */
export function applyPipelinePreset(preset, overrides = {}) {
  if (!preset) {
    return {
      days: overrides.days ?? 3,
      scope: overrides.scope ?? 'national',
      alwaysReextract: overrides.alwaysReextract ?? false,
      ingestPolicy: resolveIngestPolicy({
        alwaysReextract: overrides.alwaysReextract ?? false,
        scope: overrides.scope ?? 'national',
        replayMode: overrides.replayMode ?? false,
      }),
    };
  }

  const days = overrides.days ?? preset.days;
  const scope = overrides.scope ?? preset.scope;
  const alwaysReextract = overrides.alwaysReextract ?? preset?.alwaysReextract ?? false;
  const ingestPolicy = resolveIngestPolicy({
    ingestPolicy: preset.ingestPolicy ?? null,
    alwaysReextract,
    scope,
    replayMode: overrides.replayMode ?? false,
  });

  return { days, scope, alwaysReextract, ingestPolicy };
}
