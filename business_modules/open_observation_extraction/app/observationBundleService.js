/**
 * List and load observation bundles from the store port.
 */

/**
 * @param {{ store: import('../domain/ports/IObservationStorePort.js').IObservationStorePort }} deps
 */
export function createObservationBundleService({ store }) {
  if (!store) throw new Error('observationBundleService: store is required');

  return {
    listBundles(opts) {
      return store.listBundles(opts);
    },

    loadBundle(filename) {
      return store.loadBundle(filename);
    },

    /**
     * @param {{ endDate: string, days: number, profile?: string }}
     */
    loadBundlesInWindow({ endDate, days, profile }) {
      const targetDates = new Set();
      const end = new Date(`${endDate}T12:00:00Z`);
      for (let i = 0; i < days; i++) {
        const d = new Date(end);
        d.setUTCDate(d.getUTCDate() - i);
        targetDates.add(d.toISOString().slice(0, 10));
      }

      const entries = store.listBundles({ endDate, maxDays: days, profile });
      const bundles = [];
      for (const entry of entries) {
        if (!targetDates.has(entry.date)) continue;
        const bundle = store.loadBundle(entry.filename);
        if (bundle) bundles.push({ ...entry, bundle });
      }
      return bundles;
    },

    /**
     * Pipeline profile bundles for one source type with bundle date <= endDate (no day cap).
     * @param {{ endDate: string, sourceType: string, profile?: string }}
     */
    loadPipelineBundlesUpToDate({ endDate, sourceType, profile = 'pipeline' }) {
      const entries = store.listBundles({ endDate, maxDays: 36500, profile, sourceType });
      const bundles = [];
      for (const entry of entries) {
        if (entry.date > endDate) continue;
        const bundle = store.loadBundle(entry.filename);
        if (bundle) bundles.push({ ...entry, bundle });
      }
      return bundles;
    },
  };
}
