/**
 * Compose ISignalBundlePort for assess-signals CLI (closed default, observations optional).
 */
import { createClosedSignalBundleFsAdapter } from '../../infrastructure/adapters/closedSignalBundleFsAdapter.js';
import { createMappedObservationBundleAdapter } from '../../infrastructure/adapters/mappedObservationBundleAdapter.js';

/**
 * @param {{
 *   bundleSource?: string,
 *   observationsProfile?: string|null,
 *   signalDirs: { signalsDir: string, fieldSignalsDir: string, socialSignalsDir: string },
 * }} opts
 */
export async function createSignalBundlePort(opts) {
  const source = opts.bundleSource
    ?? process.env.ASSESS_BUNDLE_SOURCE
    ?? 'closed';

  if (source === 'observations') {
    const { createObservationBundleService, ObservationFsAdapter } = await import(
      '../../../open_observation_extraction/index.js'
    );
    const store = new ObservationFsAdapter();
    const obsService = createObservationBundleService({ store });

    return createMappedObservationBundleAdapter({
      observationsProfile: opts.observationsProfile ?? undefined,
      loadObservationBundles: (loadOpts) => obsService.loadBundlesInWindow(loadOpts),
    });
  }

  return createClosedSignalBundleFsAdapter(opts.signalDirs);
}
