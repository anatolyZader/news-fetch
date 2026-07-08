/**
 * Closed-vocabulary signal bundles from resilience_scorer/data/signals + field + social dirs.
 */
import { ISignalBundlePort } from '../../domain/ports/ISignalBundlePort.js';
import {
  discoverSignalBundles,
  loadAssessSignalFiles,
} from '../../app/assessment/assessSignalsHelpers.js';

/**
 * @param {{ signalsDir: string, fieldSignalsDir: string, socialSignalsDir: string }} dirs
 */
export function createClosedSignalBundleFsAdapter(dirs) {
  return new ClosedSignalBundleFsAdapter(dirs);
}

export class ClosedSignalBundleFsAdapter extends ISignalBundlePort {
  /**
   * @param {{ signalsDir: string, fieldSignalsDir: string, socialSignalsDir: string }} dirs
   */
  constructor(dirs) {
    super();
    this.dirs = dirs;
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
      fieldDirFiles: discovery.fieldDirFiles,
      socialDirFiles: discovery.socialDirFiles,
      signalsDir: discovery.signalsDir,
      fieldSignalsDir: discovery.fieldSignalsDir,
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
