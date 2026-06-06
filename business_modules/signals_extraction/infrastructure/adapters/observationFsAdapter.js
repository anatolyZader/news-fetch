/**
 * Filesystem store for observation bundles under module data/.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IObservationStorePort } from '../../domain/ports/IObservationStorePort.js';
import {
  observationBundleFilename,
  validateObservationBundle,
} from '../../domain/services/observationSchema.js';
import { defaultSignalsExtractionDataDir } from './signalsDataPaths.js';

export function defaultObservationDataDir(opts = {}) {
  return defaultSignalsExtractionDataDir(opts);
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
    const name = observationBundleFilename(normalized.profile, normalized.date);
    const path = resolve(this.dataDir, name);
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
      const m = /^observations-(.+)-(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
      if (!m) continue;
      const fileDate = m[2];
      if (fileDate < minStr || fileDate > endDate) continue;
      if (opts.profile && !name.startsWith(`observations-${opts.profile}-`)) {
        const profileSlug = String(opts.profile).replace(/[^a-z0-9_-]/gi, '_');
        if (!name.startsWith(`observations-${profileSlug}-`)) continue;
      }
      if (opts.date && fileDate !== opts.date) continue;
      out.push({ filename: name, profile: m[1], date: fileDate, path: resolve(this.dataDir, name) });
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
