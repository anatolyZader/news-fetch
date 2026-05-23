/**
 * File-system persistence for validation records and review queues.
 */

import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { validationPaths } from '../config/validationConfig.js';

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * @param {object} opts
 * @param {object} opts.config
 * @param {string} [opts.rootDir]
 */
export function createValidationArtifactWriter({ config, rootDir = process.cwd() } = {}) {
  const paths = validationPaths(config, rootDir);

  function writeValidationRecord(record) {
    ensureDir(paths.records);
    const scope = record.scope ?? 'national';
    const date = record.date ?? 'unknown';
    const fileName = `${date}-${scope}.json`;
    const filePath = join(paths.records, fileName);
    writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
    return filePath;
  }

  function writeReviewQueue(queue) {
    if (!queue?.items?.length) return null;
    ensureDir(paths.reviewQueue);
    const scope = queue.scope ?? 'national';
    const date = queue.date ?? 'unknown';
    const fileName = `${date}-${scope}.jsonl`;
    const filePath = join(paths.reviewQueue, fileName);
    writeFileSync(filePath, `${JSON.stringify(queue)}\n`, 'utf8');
    return filePath;
  }

  function appendPhaseLog(entry) {
    ensureDir(paths.phaseLog);
    const filePath = join(paths.phaseLog, 'phase-changes.jsonl');
    appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    return filePath;
  }

  return {
    paths,
    writeValidationRecord,
    writeReviewQueue,
    appendPhaseLog,
  };
}
