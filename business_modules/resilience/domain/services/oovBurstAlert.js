/**
 * Operator-visible OOV burst detection — dynamic semantic clustering in a rolling window.
 */

import { getDefaultStateStore } from '../../../../cross-cut-modules/persistence/infrastructure/fsStateStoreAdapter.js';
const stateStore = getDefaultStateStore();
import { resolve } from 'node:path';

import { evaluateDynamicOovClusters } from '../../../../cross-cut-modules/learningCapture/dynamicOovCluster.js';
import { LEARNING_CAPTURE_KINDS } from '../../../../cross-cut-modules/learningCapture/kinds.js';
import { embedText, embeddingsEnabled } from '../../../../cross-cut-modules/vector_index/index.js';
import { isLearningCaptureEnabled, getOovRunBuffer } from './oovCapture.js';

/**
 * @param {string} date YYYY-MM-DD
 * @param {string} [reportsDir]
 * @returns {Array<object>}
 */
export function loadOovCaptureRecordsForDate(date, reportsDir = 'daily_reports') {
  if (!isLearningCaptureEnabled()) return [];
  const path = resolve(reportsDir, `oov-capture-${date}.jsonl`);
  if (!stateStore.existsSync(path)) return [];
  try {
    const text = stateStore.readFileSync(path, 'utf8');
    return text
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/**
 * Merge file records with in-memory run buffer (dedupe by timestamp + evidence).
 * @param {Array<object>} fileRecords
 * @param {Array<object>} runRecords
 */
function mergeOovRecords(fileRecords, runRecords) {
  const seen = new Set();
  const merged = [];
  for (const rec of [...fileRecords, ...runRecords]) {
    const key = `${rec.timestamp ?? ''}|${rec.capture_kind ?? ''}|${rec.evidence ?? rec.suggested_type ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(rec);
  }
  return merged;
}

/**
 * @param {string} date
 * @param {object} [opts]
 * @param {string} [opts.reportsDir]
 * @param {boolean} [opts.digitalDarkness]
 * @param {number} [opts.anchorMs]
 * @returns {Promise<{
 *   alert: boolean,
 *   level: 'critical' | 'warning' | 'none',
 *   total: number,
 *   window_hours: number,
 *   clustering_method: string,
 *   top_cluster_key: string | null,
 *   top_cluster_count: number,
 *   top_cluster_keywords: string[],
 *   top_clusters: object[],
 *   salience_bypass: boolean,
 *   cluster_threshold: number | null,
 * }>}
 */
export async function evaluateOovBurst(date, opts = {}) {
  if (!isLearningCaptureEnabled()) {
    return evaluateDynamicOovClusters([], opts);
  }

  const fileRecords = loadOovCaptureRecordsForDate(date, opts.reportsDir);
  const runRecords = getOovRunBuffer().filter((r) => {
    const day = r.timestamp?.slice(0, 10);
    return !day || day === date;
  });
  const records = mergeOovRecords(fileRecords, runRecords);

  const embedFn = embeddingsEnabled()
    ? (text) => embedText(text)
    : undefined;

  return evaluateDynamicOovClusters(records, {
    ...opts,
    embedFn,
    digitalDarkness: opts.digitalDarkness === true,
  });
}

export { LEARNING_CAPTURE_KINDS };
