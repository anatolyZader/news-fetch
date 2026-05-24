/**
 * Stratified human-review queue for extraction / construct validation (Tier 2 + 4 prep).
 */

import { CATALOG_VERSION } from '../../domain/services/signalCatalog.js';
import { SCORING_MODEL_VERSION } from '../../domain/services/assessmentMethodology.js';

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
    oov_suggested: 4,
    low_extraction_confidence: 4,
    rare_signal_type: 3,
    random_control: 1,
  };
  return reasons.reduce((s, r) => s + (weights[r.code] ?? 1), 0);
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
  const typeCounts = {};
  for (const s of signalList) {
    const t = s?.signal_type ?? s?.type;
    if (t) typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }

  /** @type {Map<string, object>} */
  const byArticle = new Map();

  function upsertItem(key, patch) {
    const prev = byArticle.get(key) ?? {
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
  }

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

  for (const s of signalList) {
    const reasons = [];
    const conf = s.extraction_confidence;
    if (conf != null && conf < lowConf) {
      reasons.push({ code: 'low_extraction_confidence', detail: conf });
    }
    const t = s.signal_type ?? s.type;
    if (t && typeCounts[t] === 1) {
      reasons.push({ code: 'rare_signal_type', detail: t });
    }
    if (oovCaptureCount > 0 && (conf != null && conf < lowConf || (t && typeCounts[t] === 1))) {
      reasons.push({ code: 'oov_suggested', detail: oovCaptureCount });
    }
    if (dataVoidLevel === 'critical' || dataVoidLevel === 'elevated') {
      reasons.push({ code: 'data_void_context', detail: dataVoidLevel });
    }
    if (!reasons.length) continue;

    const key = articleKeyForSignal(s);
    if (!key) continue;
    upsertItem(key, {
      article_url: s.article_url ?? null,
      article_source: s.article_source ?? null,
      article_index: s.article_index ?? null,
      source_file: s.source_file ?? null,
      signal_types: t ? [t] : [],
      reasons,
      signals: [{
        signal_type: t,
        source_type: s.source_type,
        evidence: s.evidence,
        extraction_confidence: conf,
      }],
    });
  }

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
