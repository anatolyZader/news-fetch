/**
 * Load parallel pipeline open observation bundles for assess (separate from closed signals).
 */

/**
 * @param {{
 *   targetDate: string,
 *   days?: number,
 *   dataDir?: string,
 * }} opts
 */
export async function loadOpenObservationsForAssess(opts) {
  const { targetDate, days = 1, dataDir } = opts;
  const {
    createObservationBundleService,
    ObservationFsAdapter,
    defaultSignalsExtractionDataDir,
    normalizeObservations,
  } = await import('../../signals_extraction/index.js');

  const store = new ObservationFsAdapter({ dataDir: dataDir ?? defaultSignalsExtractionDataDir() });
  const service = createObservationBundleService({ store });
  const bundles = service.loadBundlesInWindow({
    endDate: targetDate,
    days,
    profile: 'pipeline',
  });

  /** @type {Array<object>} */
  const openObservations = [];
  /** @type {string[]} */
  const bundleFiles = [];

  for (const entry of bundles) {
    bundleFiles.push(entry.filename);
    const normalized = normalizeObservations(entry.bundle?.observations ?? []);
    for (const obs of normalized) {
      openObservations.push({
        ...obs,
        source: 'pipeline',
        bundle_date: entry.date,
        source_type: entry.bundle?.source_type ?? null,
        bundle_file: entry.filename,
      });
    }
  }

  return {
    openObservations,
    summary: {
      count: openObservations.length,
      profiles: ['pipeline'],
      bundle_files: bundleFiles,
    },
  };
}
