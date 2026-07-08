/**
 * Load open_observation_extraction observation bundles and map to closed signal bundles for assess.
 */
import { ISignalBundlePort } from '../../domain/ports/ISignalBundlePort.js';
import {
  buildTargetDates,
  dateOffset,
  temporalWeightForOffset,
} from '../../app/assessment/assessSignalsHelpers.js';
import { mapObservationsToSignals } from '../../domain/services/signals/catalogMappingService.js';

/**
 * @param {{
 *   loadObservationBundles: (opts: { endDate: string, days: number, profile?: string }) => Array<{ filename: string, date: string, bundle: object }>,
 *   observationsProfile?: string,
 * }} deps
 */
export function createMappedObservationBundleAdapter(deps) {
  return new MappedObservationBundleAdapter(deps);
}

export class MappedObservationBundleAdapter extends ISignalBundlePort {
  /**
   * @param {{
   *   loadObservationBundles: Function,
   *   observationsProfile?: string,
   * }} deps
   */
  constructor(deps) {
    super();
    if (!deps?.loadObservationBundles) {
      throw new Error('MappedObservationBundleAdapter: loadObservationBundles is required');
    }
    this.loadObservationBundles = deps.loadObservationBundles;
    this.observationsProfile = deps.observationsProfile ?? null;
  }

  /**
   * @param {{ targetDate: string, days: number }} opts
   */
  discoverBundles(opts) {
    const targetDates = buildTargetDates(opts.targetDate, opts.days);
    const entries = this.loadObservationBundles({
      endDate: opts.targetDate,
      days: opts.days,
      profile: this.observationsProfile ?? undefined,
    });

    const bundles = entries.filter((e) => targetDates.has(e.date));

    return {
      bundleSource: 'observations',
      bundles,
      targetDates,
      anyDirExists: bundles.length > 0,
    };
  }

  /**
   * @param {object} discovery
   * @param {{ targetDate: string }} opts
   */
  loadBundles(discovery, opts) {
    const loadedFiles = [];
    let totalSkipped = 0;

    for (const { filename, date, bundle } of discovery.bundles ?? []) {
      const offset = dateOffset(date, opts.targetDate);
      const weight = temporalWeightForOffset(offset);
      const sourceType = bundle.source_type ?? 'adhoc';

      const { signals, skipped } = mapObservationsToSignals(bundle.observations ?? [], {
        sourceType,
        fileDate: date,
        bundleProfile: bundle.profile,
      });
      totalSkipped += skipped;

      if (!signals.length) continue;

      loadedFiles.push({
        file: filename,
        sourceType,
        fileDate: date,
        fileDistrictId: bundle.district_id ?? null,
        weight,
        data: {
          source_type: sourceType,
          content_kind: bundle.content_kind ?? 'mixed',
          date,
          extracted_at: bundle.extracted_at,
          source_files: bundle.source_files ?? [],
          total_articles: bundle.total_articles ?? 0,
          signals,
          _from_observations: true,
          _observation_profile: bundle.profile,
        },
      });
    }

    if (totalSkipped > 0) {
      console.error(`  ℹ Observation mapping skipped ${totalSkipped} unmapped observation(s)`);
    }

    return loadedFiles;
  }

  /**
   * @param {object} discovery
   */
  hasAnySource(discovery) {
    return Boolean(discovery?.anyDirExists);
  }
}
