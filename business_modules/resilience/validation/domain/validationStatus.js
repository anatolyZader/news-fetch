/**
 * Roll up validation artifact maturity for analysts (Tier 2–5 readiness).
 */

import { getDefaultStateStore } from '../../../../cross-cut-modules/persistence/infrastructure/fsStateStoreAdapter.js';
const stateStore = getDefaultStateStore();
import { join } from 'node:path';

import {
  DEFAULT_VALIDATION_CONFIG,
  loadValidationConfig,
  validationPaths,
} from '../config/validationConfig.js';

/**
 * @param {string} dir
 */
function listJsonFiles(dir) {
  if (!stateStore.existsSync(dir)) return [];
  return stateStore.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

/**
 * @param {string} dir
 */
function countPendingReviewItems(dir) {
  if (!stateStore.existsSync(dir)) return { files: 0, pending: 0 };
  let pending = 0;
  let files = 0;
  for (const f of stateStore.readdirSync(dir)) {
    if (!f.endsWith('.jsonl') && !f.endsWith('.json')) continue;
    files += 1;
    const full = join(dir, f);
    try {
      const raw = stateStore.readFileSync(full, 'utf8').trim();
      if (f.endsWith('.jsonl')) {
        for (const line of raw.split('\n').filter(Boolean)) {
          const row = JSON.parse(line);
          pending += (row.items ?? []).filter((i) => i.review_status === 'pending').length;
        }
      } else {
        const row = JSON.parse(raw);
        pending += (row.items ?? []).filter((i) => i.review_status === 'pending').length;
      }
    } catch {
      // skip corrupt files
    }
  }
  return { files, pending };
}

/**
 * @param {string[]} recordFiles
 * @param {string} recordsDir
 */
function aggregateRecordStats(recordFiles, recordsDir) {
  const dates = new Set();
  const scopes = new Set();
  let labeledComponentSlots = 0;
  let filledExpertLabels = 0;

  for (const f of recordFiles) {
    try {
      const rec = JSON.parse(stateStore.readFileSync(join(recordsDir, f), 'utf8'));
      if (rec.date) dates.add(rec.date);
      if (rec.scope) scopes.add(rec.scope);
      for (const c of rec.components ?? []) {
        labeledComponentSlots += 1;
        if (Array.isArray(c.expert_labels) && c.expert_labels.length > 0) {
          filledExpertLabels += 1;
        }
      }
    } catch {
      // skip
    }
  }

  return { dates, scopes, labeledComponentSlots, filledExpertLabels };
}

/**
 * @param {object} [opts]
 * @param {string} [opts.rootDir]
 * @param {object} [opts.config]
 */
export function summarizeValidationMaturity(opts = {}) {
  const rootDir = opts.rootDir ?? process.cwd();
  const config = opts.config ?? loadValidationConfig();
  const paths = validationPaths(config, rootDir);

  const recordFiles = listJsonFiles(paths.records);
  const {
    dates,
    scopes,
    labeledComponentSlots,
    filledExpertLabels,
  } = aggregateRecordStats(recordFiles, paths.records);

  const reviewStats = countPendingReviewItems(paths.reviewQueue);
  const criteria = config.acceptance_criteria ?? DEFAULT_VALIDATION_CONFIG.acceptance_criteria;
  const tier3Min = criteria.tier3_tuning?.min_reports ?? 30;
  const tier4MinDays = criteria.tier4_construct?.min_labeled_days ?? 10;

  const tier3_ready = recordFiles.length >= tier3Min;
  const tier4_progress = {
    collection_days: dates.size,
    min_labeled_days: tier4MinDays,
    expert_label_fill_rate: labeledComponentSlots > 0
      ? Math.round((1000 * filledExpertLabels) / labeledComponentSlots) / 10
      : 0,
  };

  return {
    operational_phase: config.operational_phase,
    phase_started_at: config.phase_started_at,
    paths,
    collection: {
      record_count: recordFiles.length,
      distinct_dates: dates.size,
      scopes: [...scopes],
      latest_record_file: recordFiles[recordFiles.length - 1] ?? null,
    },
    review_queue: reviewStats,
    tier_readiness: {
      tier1_process: { status: 'active', note: 'Run npm test (golden + adversarial)' },
      tier2_extraction: {
        status: 'expand_golden_corpus',
        target: criteria.tier2_extraction,
      },
      tier3_tuning: {
        status: tier3_ready ? 'enough_records_run_suggest_tuning' : 'collecting',
        record_count: recordFiles.length,
        min_reports: tier3Min,
        script: criteria.tier3_tuning?.script ?? 'npm run suggest-tuning',
      },
      tier4_construct: {
        status: tier4_progress.collection_days >= tier4MinDays
          ? 'ready_for_expert_adjudication'
          : 'collecting_daily_records',
        ...tier4_progress,
      },
      tier5_weights: {
        status: 'stub_until_expert_labels',
        target: criteria.tier5_weights,
      },
    },
    next_actions: buildNextActions(config, {
      recordCount: recordFiles.length,
      pendingReview: reviewStats.pending,
      tier3Min,
      tier4MinDays,
      collectionDays: dates.size,
    }),
  };
}

/**
 * @param {object} config
 * @param {object} stats
 */
function buildNextActions(config, stats) {
  const actions = [];
  const phase = config.operational_phase ?? 'baseline';

  if (phase === 'baseline') {
    actions.push(
      'Peacetime: expand hand-reviewed golden corpus under business_modules/resilience/tuning/golden/.',
      'When crisis begins: set operational_phase to "elevated" or "acute" in validation-config.json.',
    );
  }

  if (stats.recordCount === 0) {
    actions.push('Run assess-signals once to create the first validation record.');
  }

  if (stats.pendingReview > 0) {
    actions.push(
      `Review ${stats.pendingReview} pending item(s) in validation/review-queue/ (expert blind scoring).`,
    );
  }

  if (stats.recordCount >= stats.tier3Min) {
    actions.push('Run npm run suggest-tuning and review advisory tanhK/certM proposals.');
  } else {
    actions.push(
      `Tier 3 tuning: ${stats.recordCount}/${stats.tier3Min} daily validation records collected.`,
    );
  }

  if (stats.collectionDays < stats.tier4MinDays) {
    actions.push(
      `Tier 4 construct validity: ${stats.collectionDays}/${stats.tier4MinDays} collection days.`,
    );
  }

  return actions;
}
