/**
 * Operator-visible OOV burst detection — dynamic semantic clustering in a rolling window.
 */

import { resolveStateStore } from '../../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}
import { resolve } from 'node:path';
import { resilienceCapturesDir } from '../paths/outputDirs.js';
import { evaluateDynamicOovClusters, evaluateInvestigationOovClusters } from './dynamicOovCluster.js';
import { embedText, embeddingsEnabled } from '../../../../../cross-cut-modules/vector_index/index.js';
import { isLearningCaptureEnabled, getOovRunBuffer } from './oovCapture.js';

/**
 * @param {string} date YYYY-MM-DD
 * @param {string} [capturesDir]
 * @returns {Array<object>}
 */
export function loadOovCaptureRecordsForDate(date, capturesDir = resilienceCapturesDir()) {
  if (!isLearningCaptureEnabled()) return [];
  const path = resolve(capturesDir, `oov-capture-${date}.jsonl`);
  if (!getStore().existsSync(path)) return [];
  try {
    const text = getStore().readFileSync(path, 'utf8');
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
 * Shared prelude for both burst evaluators: merged capture records + cluster options.
 * Returns null when learning capture is disabled (evaluators run on empty records).
 * @param {string} date
 * @param {object} opts
 */
function prepareOovEvaluation(date, opts) {
  if (!isLearningCaptureEnabled()) return null;

  const capturesDir = opts.capturesDir ?? opts.reportsDir;
  const fileRecords = loadOovCaptureRecordsForDate(date, capturesDir);
  const runRecords = getOovRunBuffer().filter((r) => {
    const day = r.timestamp?.slice(0, 10);
    return !day || day === date;
  });
  const records = mergeOovRecords(fileRecords, runRecords);

  const embedFn = embeddingsEnabled()
    ? (text) => embedText(text)
    : undefined;

  return {
    records,
    clusterOpts: {
      ...opts,
      embedFn,
      digitalDarkness: opts.digitalDarkness === true,
    },
  };
}

/**
 * @param {string} date
 * @param {object} [opts]
 * @param {string} [opts.capturesDir]
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
  const prep = prepareOovEvaluation(date, opts);
  if (!prep) return evaluateDynamicOovClusters([], opts);
  return evaluateDynamicOovClusters(prep.records, prep.clusterOpts);
}

/**
 * Investigation burst for agent path — includes residual/open observations.
 * @param {string} date
 * @param {object} [opts]
 */
export async function evaluateInvestigationBurst(date, opts = {}) {
  const prep = prepareOovEvaluation(date, opts);
  if (!prep) return evaluateInvestigationOovClusters([], opts);
  return evaluateInvestigationOovClusters(prep.records, prep.clusterOpts);
}



export {LEARNING_CAPTURE_KINDS} from '../../contracts/learningCaptureKinds.js';