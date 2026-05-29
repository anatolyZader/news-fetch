/**
 * Application service: collect validation artifacts after each assessment run.
 */

import {
  loadValidationConfig,
  validationStatusForMethodology,
} from '../config/validationConfig.js';
import { buildReviewQueue } from '../domain/reviewQueueBuilder.js';
import { buildValidationRecord } from '../domain/validationRecordBuilder.js';
import { createValidationArtifactWriter } from '../infrastructure/validationArtifactAdapter.js';
import {
  createValidationReviewSqliteStore,
  isValidationReviewSqliteEnabled,
} from '../infrastructure/adapters/validationReviewSqliteStore.js';
import { resolve } from 'node:path';

/**
 * @param {object} [deps]
 * @param {() => object} [deps.loadConfig]
 * @param {typeof createValidationArtifactWriter} [deps.createWriter]
 * @param {import('../domain/ports/IValidationReviewStorePort.js').IValidationReviewStorePort} [deps.validationReviewStore]
 */
export default function createValidationCollectionService(deps = {}) {
  const loadConfig = deps.loadConfig ?? loadValidationConfig;
  const createWriter = deps.createWriter ?? createValidationArtifactWriter;
  const validationReviewStore = deps.validationReviewStore
    ?? (isValidationReviewSqliteEnabled()
      ? createValidationReviewSqliteStore(
        process.env.SQLITE_PATH?.trim()
          ? resolve(process.env.SQLITE_PATH.trim())
          : resolve(process.cwd(), 'data', 'app.sqlite'),
      )
      : null);

  /**
   * @param {object} input
   * @param {object} input.assessment
   * @param {Array<object>} input.signals
   * @param {string} input.reportJsonPath
   * @param {string[]} [input.signalPaths]
   * @param {object} [input.pipelineConfig]
   * @param {object} [input.tuningProposal]
   * @param {string} [input.rootDir]
   * @param {string} [input.configPath]
   */
  function collectAfterAssessment(input) {
    const config = loadConfig(input.configPath);
    if (config.collection?.enabled === false) {
      return { skipped: true, reason: 'collection_disabled' };
    }

    const writer = createWriter({ config, rootDir: input.rootDir });
    const assessment = input.assessment ?? {};

    assessment.validation = {
      operational_phase: config.operational_phase,
      phase_started_at: config.phase_started_at,
      collection_mode: config.operational_phase === 'baseline' && config.collection?.shadow_in_baseline !== false
        ? 'shadow'
        : 'active',
    };

    let reviewQueue = null;
    let reviewQueuePath = null;
    if (config.collection?.write_review_queue !== false) {
      reviewQueue = buildReviewQueue({
        assessment,
        signals: input.signals,
        reviewConfig: config.review_queue,
      });
      reviewQueue.operational_phase = config.operational_phase;
      reviewQueuePath = writer.writeReviewQueue(reviewQueue);
      if (validationReviewStore && reviewQueue.date) {
        validationReviewStore.upsertQueueItems(
          reviewQueue.date,
          reviewQueue.scope ?? 'national',
          reviewQueue.items,
          {
            generated_at: reviewQueue.generated_at,
            catalog_version: reviewQueue.catalog_version,
            scoring_model_version: reviewQueue.scoring_model_version,
          },
        );
      }
    }

    const reviewQueueSummary = reviewQueue
      ? {
        item_count: reviewQueue.item_count,
        path: reviewQueuePath,
        top_reasons: summarizeTopReasons(reviewQueue.items),
      }
      : null;

    const record = buildValidationRecord({
      assessment,
      signals: input.signals,
      reportJsonPath: input.reportJsonPath,
      signalPaths: input.signalPaths,
      pipelineConfig: input.pipelineConfig,
      validationConfig: config,
      reviewQueueSummary,
      tuningProposal: input.tuningProposal ?? null,
    });

    const recordPath = writer.writeValidationRecord(record);

    if (assessment.methodology && typeof assessment.methodology === 'object') {
      assessment.methodology.validation = validationStatusForMethodology(config);
      assessment.methodology.validation.last_collection = {
        record_path: recordPath,
        review_queue_path: reviewQueuePath,
        review_item_count: reviewQueue?.item_count ?? 0,
        elevation_advisory: record.elevation_advisory ?? null,
      };
    }

    return {
      skipped: false,
      recordPath,
      reviewQueuePath,
      reviewItemCount: reviewQueue?.item_count ?? 0,
      elevationAdvisory: record.elevation_advisory,
      operationalPhase: config.operational_phase,
    };
  }

  return { collectAfterAssessment };
}

/**
 * @param {Array<object>} items
 */
function summarizeTopReasons(items) {
  const counts = {};
  for (const item of items ?? []) {
    for (const r of item.reasons ?? []) {
      counts[r.code] = (counts[r.code] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));
}
