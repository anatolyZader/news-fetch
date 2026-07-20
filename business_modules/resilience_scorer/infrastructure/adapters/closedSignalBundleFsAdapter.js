/**
 * Closed-vocabulary signal bundles from resilience_scorer/data/signals + visits + social dirs.
 */
import { ISignalBundlePort } from '../../domain/ports/ISignalBundlePort.js';
import {
  discoverSignalBundles,
  loadAssessSignalFiles,
} from '../../domain/services/paths/signalBundles.js';

/**
 * @param {{ signalsDir: string, visitsSignalsDir?: string, fieldSignalsDir?: string, socialSignalsDir: string }} dirs
 */
export function createClosedSignalBundleFsAdapter(dirs) {
  return new ClosedSignalBundleFsAdapter(dirs);
}

export class ClosedSignalBundleFsAdapter extends ISignalBundlePort {
  /**
   * @param {{ signalsDir: string, visitsSignalsDir?: string, fieldSignalsDir?: string, socialSignalsDir: string }} dirs
   */
  constructor(dirs) {
    super();
    this.dirs = {
      signalsDir: dirs.signalsDir,
      visitsSignalsDir: dirs.visitsSignalsDir ?? dirs.fieldSignalsDir,
      socialSignalsDir: dirs.socialSignalsDir,
    };
  }

  /**
   * @param {{ targetDate: string, days: number, enabledSources?: Set<string>|null }} opts
   */
  discoverBundles(opts) {
    return discoverSignalBundles({
      targetDate: opts.targetDate,
      days: opts.days,
      enabledSources: opts.enabledSources,
      ...this.dirs,
    });
  }

  /**
   * @param {object} discovery
   * @param {{ targetDate: string, enabledSources?: Set<string>|null }} opts
   */
  loadBundles(discovery, opts) {
    return loadAssessSignalFiles({
      rootFiles: discovery.rootFiles,
      visitsDirFiles: discovery.visitsDirFiles ?? discovery.fieldDirFiles,
      socialDirFiles: discovery.socialDirFiles,
      signalsDir: discovery.signalsDir,
      visitsSignalsDir: discovery.visitsSignalsDir ?? discovery.fieldSignalsDir,
      socialSignalsDir: discovery.socialSignalsDir,
      targetDate: opts.targetDate,
      targetDates: discovery.targetDates,
      recencySources: discovery.recencySources,
      enabledSources: opts.enabledSources,
    });
  }

  /**
   * @param {object} discovery
   */
  hasAnySource(discovery) {
    return Boolean(discovery?.anyDirExists);
  }
}
