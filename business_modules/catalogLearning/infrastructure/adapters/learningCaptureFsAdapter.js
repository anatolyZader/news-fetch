/**
 * Filesystem adapter for daily_reports/oov-capture-*.jsonl
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ILearningCapturePort } from '../../domain/ports/ILearningCapturePort.js';

export class LearningCaptureFsAdapter extends ILearningCapturePort {
  /**
   * @param {object} [opts]
   * @param {string} [opts.reportsDir]
   */
  constructor(opts = {}) {
    super();
    this.reportsDir = opts.reportsDir ?? 'daily_reports';
  }

  /**
   * @param {object} [opts]
   * @param {number} [opts.maxDays] — only read files from the last N calendar days
   */
  async loadCaptureRecords(opts = {}) {
    const dir = resolve(this.reportsDir);
    if (!existsSync(dir)) return { records: [], files: [] };

    const maxDays = opts.maxDays ?? 14;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const files = readdirSync(dir)
      .filter((f) => f.startsWith('oov-capture-') && f.endsWith('.jsonl'))
      .filter((f) => {
        const date = f.slice('oov-capture-'.length, 'oov-capture-'.length + 10);
        return date >= cutoffStr;
      })
      .sort();

    /** @type {Array<object>} */
    const records = [];
    for (const file of files) {
      const path = resolve(dir, file);
      const lines = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          records.push(JSON.parse(line));
        } catch {
          // skip malformed
        }
      }
    }

    return { records, files };
  }
}
