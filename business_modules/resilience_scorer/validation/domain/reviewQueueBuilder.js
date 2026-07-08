/**
 * Stratified human-review queue for extraction / construct validation (Tier 2 + 4 prep).
 */

import { CATALOG_VERSION } from '../../domain/services/signals/signalCatalog.js';
import { SCORING_MODEL_VERSION } from '../../domain/epistemic/assessmentMethodology.js';
import { SOCIAL_QUARANTINE_ARTICLE_KEY } from '../../domain/services/socialChannelQuarantine.js';

/**
 * Stable article key for deduplication.
 * @param {object} signal
 */
export function articleKeyForSignal(signal) {
  if (signal?.article_url) return `url:${signal.article_url}`;
  if (signal?.article_index != null && signal?.source_file) {
    return `file:${signal.source_file}#${signal.article_index}`;
  }
  if (signal?.article_index != null) return `idx:${signal.article_index}`;
  return null;
}

/**
 * @param {object} comp
 * @param {object} thresholds
 */
function componentFlags(comp, thresholds) {
  const reasons = [];
  const t = thresholds ?? {};
  const deltaSig = t.delta_significance ?? 2;
  const cfDelta = t.counterfactual_delta ?? 1;
  const pol = t.polarization ?? 0.5;
  const polMass = t.min_evidence_mass_for_polarization ?? 4;

  if (comp.delta_flag === 'significant') {
    reasons.push({ code: 'significant_delta', detail: comp.delta_significance });
  } else if (
    comp.delta_significance != null
    && Math.abs(comp.delta_significance) >= deltaSig
  ) {
    reasons.push({ code: 'high_delta_z', detail: comp.delta_significance });
  }

  if (
    comp.counterfactual_delta != null
    && Math.abs(comp.counterfactual_delta) >= cfDelta
  ) {
    reasons.push({ code: 'high_counterfactual', detail: comp.counterfactual_delta });
  }

  if (
    (comp.polarization ?? 0) > pol
    && (comp.evidence_mass ?? 0) > polMass
  ) {
    reasons.push({ code: 'contested_polarization', detail: comp.polarization });
  }

  const contestedThin = (comp.polarization ?? 0) > (t.contested_thin_polarization ?? 0.5)
    && (comp.evidence_mass ?? 0) >= (t.min_evidence_mass_for_contested_thin ?? 1.5)
    && (comp.evidence_mass ?? 0) < (t.max_evidence_mass_for_contested_thin ?? 4);
  if (contestedThin) {
    reasons.push({ code: 'contested_thin', detail: comp.polarization });
  }

  if (comp.source_cap_binding === true || (comp.suppression_delta != null && Math.abs(comp.suppression_delta) >= (t.suppression_delta ?? 1))) {
    reasons.push({
      code: 'suppression_binding',
      detail: comp.suppression_delta ?? comp.source_cap_binding,
    });
  }

  const ws = comp.weight_sensitivity;
  if (ws?.reliable === true && ws?.fragile === true) {
    reasons.push({
      code: 'weight_sensitivity_fragile',
      detail: ws.band_width,
    });
  }

  return reasons;
}

/**
 * @param {Array<object>} reasons
 */
function priorityScore(reasons) {
  const weights = {
    significant_delta: 10,
    high_delta_z: 8,
    high_counterfactual: 8,
    contested_polarization: 6,
    contested_thin: 5,
    suppression_binding: 5,
    weight_sensitivity_fragile: 6,
    social_quarantine_suggested: 7,
    oov_suggested: 4,
    low_extraction_confidence: 4,
    rare_signal_type: 3,
    random_control: 1,
  };
  return reasons.reduce((s, r) => s + (weights[r.code] ?? 1), 0);
}

function emptyReviewItem(key) {
  return {
    article_key: key,
    article_url: null,
    article_source: null,
    article_index: null,
    source_file: null,
    signal_types: [],
    component_ids: [],
    reasons: [],
    signals: [],
    priority: 0,
    review_status: 'pending',
  };
}

/**
 * @param {Map<string, object>} byArticle
 */
function createReviewItemUpserter(byArticle) {
  return function upsertItem(key, patch) {
    const prev = byArticle.get(key) ?? emptyReviewItem(key);
    const merged = {
      ...prev,
      ...patch,
      signal_types: [...new Set([...(prev.signal_types ?? []), ...(patch.signal_types ?? [])])],
      component_ids: [...new Set([...(prev.component_ids ?? []), ...(patch.component_ids ?? [])])],
      reasons: [...(prev.reasons ?? []), ...(patch.reasons ?? [])],
      signals: [...(prev.signals ?? []), ...(patch.signals ?? [])],
    };
    merged.priority = priorityScore(merged.reasons);
    byArticle.set(key, merged);
  };
}

/**
 * @param {Array<object>} signalList
 */
function buildSignalTypeCounts(signalList) {
  const typeCounts = {};
  for (const s of signalList) {
    const t = s?.signal_type ?? s?.type;
    if (t) typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }
  return typeCounts;
}

/**
 * @param {Map<string, object>} flaggedComponents
 * @param {ReturnType<typeof createReviewItemUpserter>} upsertItem
 * @param {object} assessment
 */
function addComponentContributorItems(flaggedComponents, upsertItem, assessment) {
  for (const comp of assessment?.components ?? []) {
    const compReasons = flaggedComponents.get(comp.component_id) ?? [];
    for (const tc of comp.top_contributors ?? []) {
      const pseudo = {
        article_url: tc.article_url,
        article_source: tc.article_source,
        signal_type: tc.signal_type,
        evidence: tc.evidence,
      };
      const key = articleKeyForSignal(pseudo);
      if (!key) continue;
      upsertItem(key, {
        article_url: tc.article_url ?? null,
        article_source: tc.article_source ?? null,
        signal_types: tc.signal_type ? [tc.signal_type] : [],
        component_ids: [comp.component_id],
        reasons: compReasons.map((r) => ({ ...r, component_id: comp.component_id })),
        signals: [{
          signal_type: tc.signal_type,
          source_type: tc.source_type,
          evidence: tc.evidence,
          _contribution: tc._contribution,
        }],
      });
    }
  }
}

/**
 * @param {object} signal
 * @param {Record<string, number>} typeCounts
 * @param {object} context
 */
function collectSignalFlagReasons(signal, typeCounts, context) {
  const { lowConf, oovCaptureCount, dataVoidLevel } = context;
  const reasons = [];
  const conf = signal.extraction_confidence;
  if (conf != null && conf < lowConf) {
    reasons.push({ code: 'low_extraction_confidence', detail: conf });
  }
  const t = signal.signal_type ?? signal.type;
  if (t && typeCounts[t] === 1) {
    reasons.push({ code: 'rare_signal_type', detail: t });
  }
  const lowConfOrRare = (conf != null && conf < lowConf) || (t && typeCounts[t] === 1);
  if (oovCaptureCount > 0 && lowConfOrRare) {
    reasons.push({ code: 'oov_suggested', detail: oovCaptureCount });
  }
  if (dataVoidLevel === 'critical' || dataVoidLevel === 'elevated') {
    reasons.push({ code: 'data_void_context', detail: dataVoidLevel });
  }
  return { reasons, signalType: t, confidence: conf };
}

/**
 * @param {object} signal
 * @param {Array<object>} reasons
 * @param {string|null|undefined} signalType
 * @param {number|null|undefined} confidence
 */
function flaggedSignalUpsertPatch(signal, reasons, signalType, confidence) {
  return {
    article_url: signal.article_url ?? null,
    article_source: signal.article_source ?? null,
    article_index: signal.article_index ?? null,
    source_file: signal.source_file ?? null,
    signal_types: signalType ? [signalType] : [],
    reasons,
    signals: [{
      signal_type: signalType,
      source_type: signal.source_type,
      evidence: signal.evidence,
      extraction_confidence: confidence,
    }],
  };
}

/**
 * @param {ReturnType<typeof createReviewItemUpserter>} upsertItem
 * @param {Array<object>} signalList
 * @param {Record<string, number>} typeCounts
 * @param {object} context
 */
function addFlaggedSignalItems(upsertItem, signalList, typeCounts, context) {
  for (const s of signalList) {
    const { reasons, signalType, confidence } = collectSignalFlagReasons(s, typeCounts, context);
    if (!reasons.length) continue;

    const key = articleKeyForSignal(s);
    if (!key) continue;
    upsertItem(key, flaggedSignalUpsertPatch(s, reasons, signalType, confidence));
  }
}

/**
 * @param {ReturnType<typeof createReviewItemUpserter>} upsertItem
 * @param {Map<string, object>} byArticle
 * @param {Array<object>} signalList
 * @param {number} controlRate
 * @param {() => number} random
 */
function addRandomControlItems(upsertItem, byArticle, signalList, controlRate, random) {
  for (const s of signalList) {
    if (random() > controlRate) continue;
    const key = articleKeyForSignal(s);
    if (!key || byArticle.has(key)) continue;
    upsertItem(key, {
      article_url: s.article_url ?? null,
      article_source: s.article_source ?? null,
      article_index: s.article_index ?? null,
      source_file: s.source_file ?? null,
      signal_types: s.signal_type ? [s.signal_type] : [],
      reasons: [{ code: 'random_control' }],
      signals: [{
        signal_type: s.signal_type ?? s.type,
        source_type: s.source_type,
        evidence: s.evidence,
      }],
    });
  }
}

/**
 * @param {object} opts
 * @param {object} opts.assessment
 * @param {Array<object>} opts.signals
 * @param {object} [opts.reviewConfig]
 * @param {() => number} [opts.random] 0..1 for tests
 */
export function buildReviewQueue({
  assessment,
  signals,
  reviewConfig,
  random = Math.random,
} = {}) {
  const cfg = reviewConfig ?? {};
  const maxItems = cfg.max_items_per_day ?? 15;
  const controlRate = cfg.random_control_rate ?? 0.02;
  const thresholds = cfg.thresholds ?? {};
  const lowConf = thresholds.low_extraction_confidence ?? 0.6;

  const flaggedComponents = new Map();
  for (const comp of assessment?.components ?? []) {
    const reasons = componentFlags(comp, thresholds);
    if (reasons.length) flaggedComponents.set(comp.component_id, reasons);
  }

  const oovCaptureCount = assessment?.oov_capture_count ?? 0;
  const dataVoidLevel = assessment?.data_void?.level ?? 'none';

  const signalList = Array.isArray(signals) ? signals : [];
  const typeCounts = buildSignalTypeCounts(signalList);

  /** @type {Map<string, object>} */
  const byArticle = new Map();
  const upsertItem = createReviewItemUpserter(byArticle);

  addComponentContributorItems(flaggedComponents, upsertItem, assessment);
  addFlaggedSignalItems(upsertItem, signalList, typeCounts, {
    lowConf,
    oovCaptureCount,
    dataVoidLevel,
  });
  addRandomControlItems(upsertItem, byArticle, signalList, controlRate, random);

  const socialQ = assessment?.social_channel_quarantine;
  if (socialQ?.suggested === true && !socialQ?.active) {
    const socialTypes = [...new Set(
      signalList.filter((s) => s?.source_type === 'social').map((s) => s.signal_type ?? s.type).filter(Boolean),
    )].slice(0, 12);
    upsertItem(SOCIAL_QUARANTINE_ARTICLE_KEY, {
      article_key: SOCIAL_QUARANTINE_ARTICLE_KEY,
      article_url: null,
      article_source: 'social',
      signal_types: socialTypes,
      component_ids: [],
      reasons: [{
        code: 'social_quarantine_suggested',
        detail: {
          social_signal_count: socialQ.social_signal_count,
          social_polarization: socialQ.social_polarization,
          social_share: socialQ.social_share,
        },
      }],
      signals: [],
    });
  }

  const items = [...byArticle.values()]
    .sort((a, b) => b.priority - a.priority || String(a.article_key).localeCompare(b.article_key))
    .slice(0, maxItems)
    .map((item, idx) => ({
      ...item,
      queue_rank: idx + 1,
      expert_labels: [],
      gold_signals: null,
    }));

  return {
    schema_version: 1,
    date: assessment?.date ?? null,
    scope: assessment?.report_scope?.id ?? 'national',
    generated_at: new Date().toISOString(),
    catalog_version: CATALOG_VERSION,
    scoring_model_version: SCORING_MODEL_VERSION,
    operational_phase: assessment?.validation?.operational_phase ?? null,
    item_count: items.length,
    max_items_per_day: maxItems,
    items,
  };
}
