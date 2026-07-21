/**
 * Load parallel pipeline open observation bundles for assess (separate from closed signals).
 */

function dedupeObservationsById(observations) {
  const seen = new Set();
  const out = [];
  for (const obs of observations) {
    const key = obs.observation_id
      ? `id:${obs.observation_id}`
      : `ev:${String(obs.evidence ?? obs.behavioral_description ?? '').slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(obs);
  }
  return out;
}

function appendBundleObservations(openObservations, bundleFiles, entry, normalizeObservations) {
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
    defaultOpenObservationDataDir,
    normalizeObservations,
  } = await import('../../../open_observation_extraction/index.js');

  const store = new ObservationFsAdapter({ dataDir: dataDir ?? defaultOpenObservationDataDir() });
  const service = createObservationBundleService({ store });

  const windowBundles = service.loadBundlesInWindow({
    endDate: targetDate,
    days,
    profile: 'pipeline',
  });

  // Unlimited history for visits (sparse channel — not limited to assess window).
  const visitsHistoricalBundles = [
    ...service.loadPipelineBundlesUpToDate({ endDate: targetDate, sourceType: 'visits' }),
  ];

  /** @type {Array<object>} */
  const openObservations = [];
  /** @type {string[]} */
  const bundleFiles = [];
  const seenFilenames = new Set();

  for (const entry of visitsHistoricalBundles) {
    if (seenFilenames.has(entry.filename)) continue;
    seenFilenames.add(entry.filename);
    appendBundleObservations(openObservations, bundleFiles, entry, normalizeObservations);
  }

  for (const entry of windowBundles) {
    const sourceType = entry.bundle?.source_type ?? null;
    if (sourceType === 'visits' || sourceType === 'field') continue;
    if (seenFilenames.has(entry.filename)) continue;
    seenFilenames.add(entry.filename);
    appendBundleObservations(openObservations, bundleFiles, entry, normalizeObservations);
  }

  const deduped = dedupeObservationsById(openObservations);

  return {
    openObservations: deduped,
    summary: {
      count: deduped.length,
      profiles: ['pipeline'],
      bundle_files: bundleFiles,
    },
  };
}
