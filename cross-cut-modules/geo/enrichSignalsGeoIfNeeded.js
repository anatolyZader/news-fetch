import { enrichSignalsWithGeo } from './enrichSignalsWithGeo.js';

/**
 * Assess-time geo fallback for legacy bundles missing persisted geo.
 * Idempotent: skips signals that already carry a geo envelope.
 *
 * @param {object[]} allSignals
 * @param {{
 *   rootDir: string,
 *   unknownSourceType?: string,
 *   logPrefix?: string,
 * }} opts
 * @returns {object[]}
 */
export function enrichSignalsGeoIfNeeded(allSignals, opts) {
  const {
    rootDir,
    unknownSourceType = 'assess-signals',
    logPrefix = 'Geo attach',
  } = opts ?? {};
  if (!rootDir) {
    throw new Error('enrichSignalsGeoIfNeeded: rootDir is required');
  }
  const needGeo = (allSignals ?? []).some((s) => !(s && 'geo' in s && s.geo != null));
  if (!needGeo) return allSignals ?? [];
  const { signals: enriched, attached, resolved, unknown } = enrichSignalsWithGeo(allSignals, {
    rootDir,
    unknownSourceType,
  });
  if (attached > 0) {
    console.error(
      `  → ${logPrefix} (all sources): ${attached} signals, ${resolved} resolved, ${unknown} unknown`,
    );
  }
  return enriched;
}
