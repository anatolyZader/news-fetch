import { mapFindingsToSignals } from '../domain/services/findingToSignalMapper.js';
import { validateOsintBundle } from '../domain/services/osintBundleValidator.js';
import { attributeSignalScope } from '../../../cross-cut-modules/geo/attributeSignalScope.js';
import { archiveSocialFindings, stampSocialSignalSourceIds } from '../../../db/source_archive/archiveSocialFindings.js';
import { createSourceArchive } from '../../../db/source_archive/createSourceArchive.js';
import { resolveSqlitePath } from '../../../cross-cut-modules/config/sqlitePath.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

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

      let signals = mapFindingsToSignals(bundle.findings);
      const { signals: attributed } = attributeSignalScope(signals, {
        rootDir: REPO_ROOT,
        sourceType: 'social',
        unknownSourceType: 'social-treat',
      });
      signals = attributed;
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

      let stampedSignals = signals;
      try {
        const sqlitePath = resolveSqlitePath(process.env, REPO_ROOT);
        const archive = createSourceArchive(sqlitePath);
        const moduleRef = `business_modules/social_media/data/signals-social-${date}.json`;
        const { archived, idMap } = archiveSocialFindings(archive, treated.findings, date, { moduleRef });
        archive.close();
        stampedSignals = stampSocialSignalSourceIds(signals, treated.findings, idMap);
        if (archived > 0) {
          console.error(`  → ${archived} social original(s) archived (${sqlitePath})`);
        }
      } catch (err) {
        console.error(`  ⚠ Social archive skipped: ${err.message}`);
      }

      const bundleToSave = { ...treated, signals: stampedSignals };
      const { path } = await persistencePort.saveBundle(date, bundleToSave);
      const report = await persistencePort.saveReport(date, bundleToSave);
      return { path, reportPath: report.path, signalCount: stampedSignals.length, bundle: bundleToSave };
    },
  };
}
