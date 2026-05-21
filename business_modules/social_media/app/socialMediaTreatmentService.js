import { mapFindingsToSignals } from '../domain/services/findingToSignalMapper.js';
import { validateOsintBundle } from '../domain/services/osintBundleValidator.js';

/**
 * @param {{ persistencePort: import('../domain/ports/ISocialMediaPersistencePort.js').ISocialMediaPersistencePort }} deps
 */
export function createSocialMediaTreatmentService({ persistencePort }) {
  if (!persistencePort) throw new Error('socialMediaTreatmentService: persistencePort is required');

  return {
    /**
     * Convert OSINT findings in a bundle to resilience-compatible signals[].
     * @param {object} bundle
     * @returns {{ bundle: object, signals: object[], errors: string[] }}
     */
    treatBundle(bundle) {
      const { valid, errors } = validateOsintBundle(bundle);
      if (!valid) {
        return { bundle, signals: [], errors };
      }

      const signals = mapFindingsToSignals(bundle.findings);
      const treated = {
        ...bundle,
        signals,
        treated_at: new Date().toISOString(),
        total_articles: bundle.findings?.length ?? 0,
        source_files: [
          `business_modules/social_media/data/signals-social-${bundle.date}.json`,
          `business_modules/social_media/data/social-osint-report-${bundle.date}.md`,
        ],
      };

      return { bundle: treated, signals, errors: [] };
    },

    /**
     * Load, treat, and persist bundle + markdown report for a date.
     * @param {string} date YYYY-MM-DD
     */
    async treatAndSave(date) {
      const bundle = await persistencePort.loadBundle(date);
      if (!bundle) {
        throw new Error(`No social OSINT bundle found for ${date}`);
      }

      const { bundle: treated, signals, errors } = this.treatBundle(bundle);
      if (errors.length) {
        throw new Error(`Invalid OSINT bundle: ${errors.join('; ')}`);
      }

      const { path } = await persistencePort.saveBundle(date, treated);
      const report = await persistencePort.saveReport(date, treated);
      return { path, reportPath: report.path, signalCount: signals.length, bundle: treated };
    },
  };
}
