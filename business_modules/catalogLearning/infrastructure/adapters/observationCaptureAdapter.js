/**
 * Load open observation bundles from signals_extraction for catalog gap clustering.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ILearningCapturePort } from '../../domain/ports/ILearningCapturePort.js';
import { LEARNING_CAPTURE_KINDS } from '../../domain/services/learningCaptureKinds.js';

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../signals_extraction');

/**
 * @param {{ dataDir?: string }} [opts]
 */
export function defaultObservationCaptureDir(opts = {}) {
  return opts.dataDir ?? resolve(MODULE_ROOT, 'data');
}

export class ObservationCaptureAdapter extends ILearningCapturePort {
  /**
   * @param {{ dataDir?: string }} [opts]
   */
  constructor(opts = {}) {
    super();
    this.dataDir = defaultObservationCaptureDir(opts);
  }

  /**
   * @param {object} [opts]
   * @param {number} [opts.maxDays]
   */
  async loadCaptureRecords(opts = {}) {
    const dir = this.dataDir;
    if (!existsSync(dir)) return { records: [], files: [] };

    const maxDays = opts.maxDays ?? 14;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const files = readdirSync(dir)
      .filter((f) => f.startsWith('observations-') && f.endsWith('.json'))
      .filter((f) => {
        const m = /observations-.+-(\d{4}-\d{2}-\d{2})\.json$/.exec(f);
        return m && m[1] >= cutoffStr;
      })
      .sort();

    /** @type {Array<object>} */
    const records = [];
    for (const file of files) {
      const path = resolve(dir, file);
      let bundle;
      try {
        bundle = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        continue;
      }
      const profile = bundle.profile ?? 'exploratory';
      for (const obs of bundle.observations ?? []) {
        const evidence = String(obs.evidence ?? '').trim();
        if (!evidence) continue;
        records.push({
          capture_kind: LEARNING_CAPTURE_KINDS.OPEN_OBSERVATION,
          behavioral_description: obs.behavioral_description ?? null,
          evidence,
          suggested_type: obs.suggested_catalog_types?.[0] ?? null,
          nearest_existing_types: obs.nearest_existing_types ?? obs.suggested_catalog_types ?? [],
          novelty_hint: obs.novelty_hint ?? null,
          observation_profile: profile,
          source_file: file,
          timestamp: bundle.extracted_at ?? new Date().toISOString(),
        });
      }
    }

    return { records, files };
  }
}
