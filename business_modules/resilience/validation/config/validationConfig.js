/**
 * Operational validation / calibration configuration (peacetime + crisis collection).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VALIDATION_MODULE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const OPERATIONAL_PHASES = Object.freeze(['baseline', 'elevated', 'acute']);

export const DEFAULT_VALIDATION_CONFIG = Object.freeze({
  operational_phase: 'baseline',
  phase_started_at: null,
  collection: {
    enabled: true,
    write_review_queue: true,
    shadow_in_baseline: true,
  },
  auto_elevation: {
    enabled: true,
    advisory_only: true,
    min_daily_signals: 150,
    min_daily_articles: 40,
  },
  review_queue: {
    max_items_per_day: 15,
    random_control_rate: 0.02,
    thresholds: {
      delta_significance: 2,
      counterfactual_delta: 1,
      polarization: 0.5,
      min_evidence_mass_for_polarization: 4,
      low_extraction_confidence: 0.6,
    },
  },
  acceptance_criteria: {
    tier1_process: 'adversarial + golden corpus in CI',
    tier2_extraction: {
      micro_f1_min: 0.65,
      macro_kappa_min: 0.5,
      min_hand_reviewed_articles: 80,
    },
    tier3_tuning: {
      min_reports: 30,
      script: 'npm run suggest-tuning',
    },
    tier4_construct: {
      min_labeled_days: 10,
      min_raters: 2,
      spearman_min: 0.6,
    },
    tier5_weights: {
      min_labeled_examples: 50,
      module: 'signalWeightsFit.js',
    },
  },
  paths: {
    validation_dir: 'business_modules/resilience/validation/artifacts',
    records_subdir: 'records',
    review_queue_subdir: 'review-queue',
    phase_log_subdir: 'phase-log',
  },
});

function deepMerge(base, override) {
  if (override == null || typeof override !== 'object' || Array.isArray(override)) {
    return override ?? base;
  }
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = v != null && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object'
      ? deepMerge(base[k], v)
      : v;
  }
  return out;
}

/** Default validation-config.json beside this module. */
export function defaultValidationConfigPath() {
  return resolve(VALIDATION_MODULE_DIR, 'validation-config.json');
}

/**
 * @param {string} [configPath]
 */
export function resolveValidationConfigPath(configPath) {
  if (configPath) return resolve(configPath);
  if (process.env.VALIDATION_CONFIG_PATH) return resolve(process.env.VALIDATION_CONFIG_PATH);
  const modulePath = defaultValidationConfigPath();
  if (existsSync(modulePath)) return modulePath;
  return resolve(process.cwd(), 'validation-config.json');
}

/**
 * @param {string} [configPath]
 */
export function loadValidationConfig(configPath) {
  const path = resolveValidationConfigPath(configPath);
  if (!existsSync(path)) {
    return { ...DEFAULT_VALIDATION_CONFIG, _config_path: path, _loaded: false };
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const merged = deepMerge(DEFAULT_VALIDATION_CONFIG, raw);
    const phase = merged.operational_phase;
    if (!OPERATIONAL_PHASES.includes(phase)) {
      throw new Error(`invalid operational_phase: ${phase}`);
    }
    return { ...merged, _config_path: path, _loaded: true };
  } catch (err) {
    throw new Error(`Failed to load validation config at ${path}: ${err.message}`);
  }
}

/**
 * Resolve validation artifact directories from config.
 * @param {object} config
 * @param {string} [rootDir]
 */
export function validationPaths(config, rootDir = process.cwd()) {
  const p = config?.paths ?? DEFAULT_VALIDATION_CONFIG.paths;
  const base = resolve(rootDir, p.validation_dir ?? 'business_modules/resilience/validation/artifacts');
  return {
    root: base,
    records: resolve(base, p.records_subdir ?? 'records'),
    reviewQueue: resolve(base, p.review_queue_subdir ?? 'review-queue'),
    phaseLog: resolve(base, p.phase_log_subdir ?? 'phase-log'),
  };
}

/**
 * Advisory heuristic: suggest phase elevation when volume spikes (never auto-applies).
 * @param {{ signalCount?: number, articleCount?: number }} metrics
 * @param {object} config
 */
export function computeElevationAdvisory(metrics, config) {
  const auto = config?.auto_elevation ?? DEFAULT_VALIDATION_CONFIG.auto_elevation;
  if (!auto.enabled) return null;

  const signals = metrics.signalCount ?? 0;
  const articles = metrics.articleCount ?? 0;
  const hitSignals = signals >= (auto.min_daily_signals ?? 150);
  const hitArticles = articles >= (auto.min_daily_articles ?? 40);

  if (!hitSignals && !hitArticles) return null;

  const phase = config.operational_phase ?? 'baseline';
  if (phase === 'acute') return null;

  const suggested = phase === 'baseline' ? 'elevated' : 'acute';
  return {
    advisory_only: auto.advisory_only !== false,
    current_phase: phase,
    suggested_phase: suggested,
    triggers: {
      signal_count: hitSignals ? signals : null,
      article_count: hitArticles ? articles : null,
      min_daily_signals: auto.min_daily_signals,
      min_daily_articles: auto.min_daily_articles,
    },
    message:
      `Volume thresholds met (${signals} signals, ${articles} articles). ` +
      `Consider setting operational_phase to "${suggested}" in business_modules/resilience/validation/validation-config.json.`,
  };
}

/**
 * @param {object} config
 */
export function validationStatusForMethodology(config) {
  const phase = config?.operational_phase ?? 'baseline';
  const criteria = config?.acceptance_criteria ?? DEFAULT_VALIDATION_CONFIG.acceptance_criteria;
  return {
    operational_phase: phase,
    phase_started_at: config?.phase_started_at ?? null,
    collection_enabled: config?.collection?.enabled !== false,
    tiers: {
      tier1_process: { status: 'active_in_ci', note: criteria.tier1_process },
      tier2_extraction: { status: 'golden_corpus_partial', target: criteria.tier2_extraction },
      tier3_tuning: { status: 'awaiting_report_history', target: criteria.tier3_tuning },
      tier4_construct: { status: 'awaiting_expert_labels', target: criteria.tier4_construct },
      tier5_weights: { status: 'stub_only', target: criteria.tier5_weights },
    },
  };
}
