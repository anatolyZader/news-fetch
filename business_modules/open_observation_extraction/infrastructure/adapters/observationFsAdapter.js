/**
 * Filesystem store for observation bundles under module data/.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IObservationStorePort } from '../../domain/ports/IObservationStorePort.js';
import {
  observationBundleFilename,
  pipelineObservationBundleFilename,
  validateObservationBundle,
  isPipelineObservationFilename,
} from '../../domain/services/observationSchema.js';
import { defaultOpenObservationDataDir } from '../signalsDataPaths.js';
import { archiveArtifactBeforeWrite } from '../../../../cross-cut-modules/log/index.js';

export function defaultObservationDataDir(opts = {}) {
  return defaultOpenObservationDataDir(opts);
}

function observationBundleMatchesListOpts(name, opts, endDate, minStr) {
  if (opts.profile === 'pipeline' && !isPipelineObservationFilename(name)) return false;
  const m = /^observations-(.+)-(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
  if (!m) return false;
  const fileDate = m[2];
  if (fileDate < minStr || fileDate > endDate) return false;
  if (opts.profile && opts.profile !== 'pipeline' && !name.startsWith(`observations-${opts.profile}-`)) {
    const profileSlug = String(opts.profile).replaceAll(/[^a-z0-9_-]/gi, '_');
    if (!name.startsWith(`observations-${profileSlug}-`)) return false;
  }
  if (opts.sourceType && opts.profile === 'pipeline') {
    const expected = pipelineObservationBundleFilename(opts.sourceType, fileDate);
    if (name !== expected) return false;
  }
  if (opts.date && fileDate !== opts.date) return false;
  return true;
}

export class ObservationFsAdapter extends IObservationStorePort {
  /**
   * @param {{ dataDir?: string }} [opts]
   */
  constructor(opts = {}) {
    super();
    this.dataDir = defaultObservationDataDir(opts);
  }

  /**
   * @param {object} bundle
   */
  writeBundle(bundle) {
    const { valid, errors, bundle: normalized } = validateObservationBundle(bundle);
    if (!valid) {
      throw new Error(`Invalid observation bundle: ${errors.join('; ')}`);
    }
    mkdirSync(this.dataDir, { recursive: true });
    const name = normalized.profile === 'pipeline'
      ? pipelineObservationBundleFilename(normalized.source_type, normalized.date)
      : observationBundleFilename(normalized.profile, normalized.date);
    const path = resolve(this.dataDir, name);
    const archived = archiveArtifactBeforeWrite(path);
    if (archived) {
      console.error(`  → Prior open bundle archived: ${archived}`);
    }
    writeFileSync(path, JSON.stringify(normalized, null, 2), 'utf8');
    return path;
  }

  /**
   * @param {{ profile?: string, date?: string, maxDays?: number, endDate?: string }} [opts]
   */
  listBundles(opts = {}) {
    if (!existsSync(this.dataDir)) return [];
    const names = readdirSync(this.dataDir).filter((f) =>
      f.startsWith('observations-') && f.endsWith('.json'),
    );
    const endDate = opts.endDate ?? opts.date ?? new Date().toISOString().slice(0, 10);
    const maxDays = opts.maxDays ?? 365;
    const minDate = new Date(`${endDate}T12:00:00Z`);
    minDate.setUTCDate(minDate.getUTCDate() - (maxDays - 1));
    const minStr = minDate.toISOString().slice(0, 10);

    const out = [];
    for (const name of names) {
      if (!observationBundleMatchesListOpts(name, opts, endDate, minStr)) continue;
      const m = /^observations-(.+)-(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
      if (!m) continue;
      out.push({ filename: name, profile: m[1], date: m[2], path: resolve(this.dataDir, name) });
    }
    return out.sort((a, b) => a.filename.localeCompare(b.filename));
  }

  /**
   * @param {string} filename
   */
  loadBundle(filename) {
    const path = resolve(this.dataDir, filename);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return null;
    }
  }
}
