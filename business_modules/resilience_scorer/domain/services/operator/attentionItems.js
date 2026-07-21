/**
 * Derive unified attention items for the operator report panel.
 *
 * Pipeline position: post-finalize — consumes redacted assessment; feeds UI panel,
 * decision brief payload, and novelty annotation across prior reports.
 *
 * Owns: attention item taxonomy (level, kind, code), sort/collapse rules, epistemic
 * and data-void situational items, decision-brief priority merge.
 * Does NOT: mutate assessment, run LLM, or compute void index.
 *
 * Key collaborators: `operator/assessmentDisplayTier.js`, `operator/decisionBriefPrompt.js`,
 * assessment.data_void, pattern alerts, operator_recommendations.
 */

import { deriveInstrumentState, DISPLAY_VIEWS } from './assessmentDisplayTier.js';
import { THIN_EVIDENCE_INSTRUMENT } from '../../epistemic/thinEvidencePolicy.js';
import { isSoftVoidWarning } from '../../contracts/softVoidReasons.js';

// ── Taxonomy constants ────────────────────────────────────────────────────────

/** Urgency sort order: lower number = higher urgency. */
export const ATTENTION_LEVELS = Object.freeze({
  critical: 0,
  warning: 1,
  watch: 2,
  info: 3,
});

/**
 * Orthogonal attention intent for panel grouping (situational vs epistemic vs tasking).
 *
 * @readonly
 */
export const ATTENTION_KINDS = Object.freeze({
  situational: 'situational',
  tasking: 'tasking',
  epistemic: 'epistemic',
  pipeline: 'pipeline',
});

const KIND_PRIORITY = Object.freeze({
  situational: 0,
  tasking: 1,
  epistemic: 2,
  pipeline: 3,
});

const NOVELTY_PRIORITY = Object.freeze({
  escalating: 0,
  new: 1,
  ongoing: 2,
});

/**
 * Map an item `code` to its attention kind. Codes not listed (pattern detections,
 * operator recommendations) are resolved via {@link kindForItem} fallback.
 */
const KIND_BY_CODE = Object.freeze({
  // Situational — something in the world changed / an emerging risk
  presence_gate: ATTENTION_KINDS.situational,
  critical_single_signal: ATTENTION_KINDS.situational,
  unverified_alert: ATTENTION_KINDS.situational,
  oov_burst: ATTENTION_KINDS.situational,
  macro_signals: ATTENTION_KINDS.situational,
  // Tasking — a concrete action with a target/channel
  abstention_fatigue: ATTENTION_KINDS.tasking,
  decision_brief_priority: ATTENTION_KINDS.tasking,
  // Epistemic — how much to trust today's picture; what to corroborate
  digital_darkness: ATTENTION_KINDS.epistemic,
  data_void_drop: ATTENTION_KINDS.epistemic,
  affected_clusters: ATTENTION_KINDS.epistemic,
  sampling_blind: ATTENTION_KINDS.epistemic,
  field_anchor_only: ATTENTION_KINDS.epistemic,
  quarantined_digital: ATTENTION_KINDS.epistemic,
  persisted_digital_quarantine: ATTENTION_KINDS.epistemic,
  geo_quality_low: ATTENTION_KINDS.epistemic,
  thin_evidence: ATTENTION_KINDS.epistemic,
  contested_evidence: ATTENTION_KINDS.epistemic,
  osint_quarantine_auto: ATTENTION_KINDS.epistemic,
  social_quarantine_active: ATTENTION_KINDS.epistemic,
  social_quarantine_suggested: ATTENTION_KINDS.epistemic,
  // Pipeline — measurement/catalog housekeeping (analyst audience)
  oov_scoring_applied: ATTENTION_KINDS.pipeline,
  oov_capture: ATTENTION_KINDS.pipeline,
  calibration_deficit: ATTENTION_KINDS.pipeline,
});

/** Component-instrument codes that are collapsed into one item per component. */
const COMPONENT_INSTRUMENT_CODES = new Set([
  'presence_gate',
  'critical_single_signal',
  'unverified_alert',
  'thin_evidence',
  'contested_evidence',
]);

// ── Item builders (internal) ──────────────────────────────────────────────────

/**
 * @param {'critical'|'warning'|'watch'|'info'} level
 * @param {string} id
 * @param {string} code
 * @param {string} titleKey
 * @param {object} [extra]
 */
function item(level, id, code, titleKey, extra = {}) {
  return {
    id,
    level,
    code,
    title_key: titleKey,
    ...extra,
  };
}

/**
 * @param {object} it
 * @returns {string}
 */
function kindForItem(it) {
  if (KIND_BY_CODE[it.code]) return KIND_BY_CODE[it.code];
  // Pattern detections and operator recommendations carry an actionable channel set.
  if (it.recommendation_id || (Array.isArray(it.channels) && it.channels.length > 0)) {
    return ATTENTION_KINDS.tasking;
  }
  return ATTENTION_KINDS.epistemic;
}

/**
 * Comparable urgency magnitude pulled from detail params / evidence, used as a
 * secondary sort key so larger shifts float above minor caveats at equal level.
 * @param {object} it
 * @returns {number}
 */
function magnitudeForItem(it) {
  const p = it.detail_params ?? {};
  if (typeof it.evidence_count === 'number' && it.evidence_count > 0) return it.evidence_count;
  if (typeof p.n === 'number') return p.n;
  if (typeof p.count === 'number') return p.count;
  return 0;
}

/**
 * @param {object} a
 * @param {object} b
 */
function compareAttentionItems(a, b) {
  const ra = a.brief_rank ?? Number.POSITIVE_INFINITY;
  const rb = b.brief_rank ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;

  const la = ATTENTION_LEVELS[a.level] ?? 99;
  const lb = ATTENTION_LEVELS[b.level] ?? 99;
  if (la !== lb) return la - lb;

  const ka = KIND_PRIORITY[a.kind] ?? 9;
  const kb = KIND_PRIORITY[b.kind] ?? 9;
  if (ka !== kb) return ka - kb;

  const ma = a.magnitude ?? 0;
  const mb = b.magnitude ?? 0;
  if (ma !== mb) return mb - ma;

  const na = NOVELTY_PRIORITY[a.novelty] ?? 9;
  const nb = NOVELTY_PRIORITY[b.novelty] ?? 9;
  if (na !== nb) return na - nb;

  const ca = a.component_id ?? '';
  const cb = b.component_id ?? '';
  if (ca !== cb) return ca.localeCompare(cb);
  return String(a.code).localeCompare(String(b.code));
}

// ── Sorting and collapse ──────────────────────────────────────────────────────

/**
 * Stable sort honoring the full attention comparator.
 *
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
export function sortAttentionItems(items) {
  return [...(items ?? [])].sort(compareAttentionItems);
}

/**
 * Collapse multiple component-instrument items for the same component into a single
 * dominant item, recording the suppressed codes on `sub_codes` so the UI can show
 * "+N more" instead of stacking near-duplicate rows.
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
function collapseComponentItems(items) {
  const groups = new Map();
  const result = [];

  for (const it of items) {
    if (it.component_id && COMPONENT_INSTRUMENT_CODES.has(it.code)) {
      const arr = groups.get(it.component_id) ?? [];
      arr.push(it);
      groups.set(it.component_id, arr);
    } else {
      result.push(it);
    }
  }

  for (const group of groups.values()) {
    group.sort((a, b) => {
      const la = ATTENTION_LEVELS[a.level] ?? 99;
      const lb = ATTENTION_LEVELS[b.level] ?? 99;
      if (la !== lb) return la - lb;
      const ka = KIND_PRIORITY[a.kind] ?? 9;
      const kb = KIND_PRIORITY[b.kind] ?? 9;
      if (ka !== kb) return ka - kb;
      return (b.magnitude ?? 0) - (a.magnitude ?? 0);
    });
    const [winner, ...rest] = group;
    if (rest.length > 0) {
      winner.sub_codes = rest.map((r) => r.code);
    }
    result.push(winner);
  }

  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build sorted attention items from a finalized assessment.
 *
 * @param {object | null | undefined} assessment
 * @param {{ view?: 'operator' | 'analyst', reportScopeId?: string, priorReports?: Array<object> }} [opts]
 * @returns {Array<object>}
 */
export function buildAttentionItems(assessment, opts = {}) {
  if (!assessment || typeof assessment !== 'object') return [];

  const view = opts.view === DISPLAY_VIEWS.analyst
    ? DISPLAY_VIEWS.analyst
    : DISPLAY_VIEWS.operator;
  const isAnalyst = view === DISPLAY_VIEWS.analyst;
  const reportScopeId = opts.reportScopeId
    ?? assessment.report_scope?.id
    ?? 'national';

  const items = [];
  const seenIds = new Set();
  const push = createAttentionPush(items, seenIds);

  const dataVoid = assessment.data_void ?? null;
  const epistemicStatus = assessment.epistemic_status ?? null;
  const assessmentMode = assessment.assessment_mode ?? 'normal';
  const methodology = assessment.methodology ?? null;

  addDataVoidAttentionItems(push, item, dataVoid);
  addAbstentionFatigueItems(push, item, assessment, opts.priorReports ?? []);
  addEpistemicAttentionItems(push, item, assessment, assessmentMode, epistemicStatus);
  addGeoAttentionItems(push, item, methodology, reportScopeId);
  addComponentAttentionItems(push, item, assessment.components, {
    dataVoid,
    epistemicStatus,
  });
  addClusterAttentionItems(push, item, dataVoid);
  addSocialQuarantineAttentionItems(push, item, assessment.social_channel_quarantine ?? null);
  addMacroAttentionItems(push, item, assessment);
  addOovAttentionItems(push, item, assessment, isAnalyst, methodology);
  addOperatorRecommendationItems(push, item, assessment.operator_recommendations);

  // Pattern detections carry channels/evidence; surface only those not already
  // represented by a pending operator recommendation (recs are 1:1 with patterns).
  const coveredPatternCodes = new Set(
    (assessment.operator_recommendations ?? [])
      .filter((r) => r.status === 'pending')
      .map((r) => r.pattern_code)
      .filter(Boolean),
  );
  addPatternAttentionItems(push, item, assessment.pattern_alerts, coveredPatternCodes);

  for (const it of items) {
    it.kind = kindForItem(it);
    it.magnitude = magnitudeForItem(it);
  }

  return sortAttentionItems(collapseComponentItems(items));
}

/**
 * Annotate items with day-over-day novelty by comparing against the prior report's
 * attention items: `new` (absent yesterday), `escalating` (more severe than yesterday),
 * or `ongoing`. Mutates and returns `currentItems` (caller re-sorts).
 * @param {Array<object>} currentItems
 * @param {Array<object>} priorItems
 * @returns {Array<object>}
 */
export function annotateAttentionNovelty(currentItems, priorItems) {
  const prior = new Map();
  for (const p of priorItems ?? []) {
    if (p?.id) prior.set(p.id, p.level);
  }
  for (const it of currentItems ?? []) {
    if (!prior.has(it.id)) {
      it.novelty = 'new';
      continue;
    }
    const priorLevel = ATTENTION_LEVELS[prior.get(it.id)] ?? 99;
    const curLevel = ATTENTION_LEVELS[it.level] ?? 99;
    it.novelty = curLevel < priorLevel ? 'escalating' : 'ongoing';
  }
  return currentItems;
}

/**
 * Fold the LLM decision brief's ranked priority items into the attention list:
 * matching items are annotated with the brief rationale/next-step and a `brief_rank`
 * that floats them to the head; unmatched priority items become synthesized head items.
 * Mutates matched items; returns a new array (caller re-sorts).
 * @param {Array<object>} items
 * @param {object|null|undefined} decisionBrief
 * @returns {Array<object>}
 */
export function applyDecisionBriefPriority(items, decisionBrief) {
  const priorityItems = decisionBrief?.priority_items;
  if (!Array.isArray(priorityItems) || priorityItems.length === 0) return items ?? [];

  const result = [...(items ?? [])];
  const byId = new Map(result.map((it) => [it.id, it]));
  const byRec = new Map();
  for (const it of result) {
    if (it.recommendation_id) byRec.set(it.recommendation_id, it);
  }

  priorityItems.forEach((p, i) => {
    let target = null;
    if (p.attention_id && byId.has(p.attention_id)) target = byId.get(p.attention_id);
    else if (p.recommendation_id && byRec.has(p.recommendation_id)) target = byRec.get(p.recommendation_id);

    if (target) {
      target.brief_rank = i;
      target.brief_rationale = p.rationale ?? null;
      target.brief_next_step = p.suggested_next_step ?? null;
      target.kind = ATTENTION_KINDS.tasking;
      return;
    }

    result.push({
      id: `brief:${p.attention_id ?? p.recommendation_id ?? i}`,
      level: ['critical', 'warning', 'watch', 'info'].includes(p.level) ? p.level : 'watch',
      code: 'decision_brief_priority',
      title_key: 'attention.brief.priorityItem',
      kind: ATTENTION_KINDS.tasking,
      magnitude: 0,
      brief_rank: i,
      brief_rationale: p.rationale ?? null,
      brief_next_step: p.suggested_next_step ?? null,
      suggested_action_key: null,
    });
  });

  return result;
}

// ─── Attention item builders (formerly attentionItemsHelpers.js) ───────────

/**
 * @param {Array<object>} items
 * @param {Set<string>} seenIds
 */
function createAttentionPush(items, seenIds) {
  return function push(entry) {
    if (!entry?.id || seenIds.has(entry.id)) return;
    seenIds.add(entry.id);
    items.push(entry);
  };
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {object|null} dataVoid
 */
function addDataVoidAttentionItems(push, item, dataVoid) {
  const voidLevel = dataVoid?.level ?? 'none';
  if (voidLevel === 'critical' || dataVoid?.digital_darkness === true) {
    push(item('critical', 'data_void:critical', 'digital_darkness', 'attention.dataVoid.critical', {
      detail_key: 'attention.dataVoid.criticalDetail',
      detail_params: {
        level: voidLevel,
        digital: dataVoid?.digital_darkness ? 'yes' : 'no',
        reason: dataVoid?.reason ?? null,
        vacuum_index: dataVoid?.information_vacuum_index ?? null,
      },
      suggested_action_key: 'attention.suggested.reviewEvidence',
    }));
    return;
  }
  if (voidLevel === 'elevated' || voidLevel === 'warning') {
    if (isSoftVoidWarning(dataVoid)) return;
    push(item('warning', `data_void:${voidLevel}`, 'data_void_drop', 'attention.dataVoid.warning', {
      detail_key: 'attention.dataVoid.warningDetail',
      detail_params: {
        level: voidLevel,
        reason: dataVoid?.reason ?? null,
      },
      suggested_action_key: 'attention.suggested.reviewEvidence',
    }));
  }
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {object} assessment
 * @param {string} assessmentMode
 * @param {object|null} epistemicStatus
 */
function addEpistemicAttentionItems(push, item, assessment, assessmentMode, epistemicStatus) {
  if (assessmentMode === 'abstained'
    || (epistemicStatus?.sampling_status === 'blind' && assessmentMode === 'abstained')) {
    push(item('critical', 'epistemic:sampling_blind', 'sampling_blind', 'attention.epistemic.samplingBlind', {
      suggested_action_key: 'attention.suggested.fieldCorroboration',
    }));
  }

  if (assessmentMode === 'field_anchor_only') {
    push(item('warning', 'epistemic:field_anchor_only', 'field_anchor_only', 'attention.epistemic.fieldAnchorOnly', {
      detail_key: 'attention.epistemic.fieldAnchorOnlyDetail',
      detail_params: {},
      suggested_action_key: 'attention.suggested.fieldCorroboration',
    }));
  }

  const quarantinedDigital = assessment.quarantined_digital ?? null;
  if ((quarantinedDigital?.count ?? 0) > 0) {
    push(item('warning', 'epistemic:quarantined_digital', 'quarantined_digital', 'attention.quarantinedDigital', {
      detail_key: 'attention.quarantinedDigitalDetail',
      detail_params: {
        n: quarantinedDigital.count,
        reason: quarantinedDigital.reason ?? null,
      },
      suggested_action_key: 'attention.suggested.reviewEvidence',
    }));
  }

  const persistedQuarantine = assessment.digital_quarantine_state ?? null;
  if (persistedQuarantine?.active === true && (quarantinedDigital?.count ?? 0) === 0) {
    push(item('warning', 'epistemic:persisted_quarantine', 'persisted_digital_quarantine', 'attention.quarantinedDigitalPersisted', {
      detail_key: 'attention.quarantinedDigitalPersistedDetail',
      detail_params: {
        reason: persistedQuarantine.reason ?? null,
        since: persistedQuarantine.since ?? null,
      },
      suggested_action_key: 'attention.suggested.reviewEvidence',
    }));
  }
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {object|null} methodology
 * @param {string} reportScopeId
 */
function addGeoAttentionItems(push, item, methodology, reportScopeId) {
  const geoQuality = methodology?.scope?.geo_quality_summary ?? null;
  const geoMetricsSafePct = geoQuality?.pctUsableForMetrics ?? null;
  if (geoMetricsSafePct != null && geoMetricsSafePct < 75 && reportScopeId !== 'national') {
    push(item('warning', 'geo:low_metrics_safe', 'geo_quality_low', 'attention.geo.lowMetricsSafe', {
      detail_key: 'attention.geo.lowMetricsSafeDetail',
      detail_params: { pct: Math.round(geoMetricsSafePct) },
    }));
  }
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {object} comp
 * @param {object} assessmentContext
 */
function addSingleComponentAttentionItems(push, item, comp, assessmentContext) {
  const componentId = comp.component_id;
  if (!componentId) return;

  const inst = comp.instrument ?? deriveInstrumentState(comp, assessmentContext);
  const thinInstrument = inst.thin_evidence_instrument;

  if (thinInstrument === THIN_EVIDENCE_INSTRUMENT.critical_presence_failure
    || comp.presence_gate_triggered === true) {
    push(item('critical', `component:${componentId}:presence`, 'presence_gate', 'attention.component.presenceGate', {
      component_id: componentId,
      detail_key: 'attention.component.presenceGateDetail',
      detail_params: {
        component_id: componentId,
        signal_type: comp.presence_gate?.signal_type ?? null,
      },
      suggested_action_key: 'attention.suggested.reviewComponent',
    }));
  } else if (thinInstrument === THIN_EVIDENCE_INSTRUMENT.critical_single_signal) {
    push(item('critical', `component:${componentId}:salience`, 'critical_single_signal', 'attention.component.criticalSingleSignal', {
      component_id: componentId,
      detail_key: 'attention.component.criticalSingleSignalDetail',
      detail_params: { component_id: componentId },
      suggested_action_key: 'attention.suggested.reviewComponent',
    }));
  } else if (thinInstrument === THIN_EVIDENCE_INSTRUMENT.unverified_alert) {
    push(item('warning', `component:${componentId}:unverified`, 'unverified_alert', 'attention.component.unverifiedAlert', {
      component_id: componentId,
      detail_key: 'attention.component.unverifiedAlertDetail',
      detail_params: { component_id: componentId },
      suggested_action_key: 'attention.suggested.reviewComponent',
    }));
  }

  if (inst.contested_thin === true || (inst.evidence_sufficiency === 'thin' && thinInstrument === THIN_EVIDENCE_INSTRUMENT.limited_evidence_neutral)) {
    push(item('watch', `component:${componentId}:thin`, 'thin_evidence', 'attention.component.thinEvidence', {
      component_id: componentId,
      detail_key: 'attention.component.thinEvidenceDetail',
      detail_params: { component_id: componentId },
      suggested_action_key: 'attention.suggested.reviewComponent',
    }));
  }

  if (inst.contested === true && inst.contested_thin !== true) {
    push(item('watch', `component:${componentId}:contested`, 'contested_evidence', 'attention.component.contestedEvidence', {
      component_id: componentId,
      detail_key: 'attention.component.contestedEvidenceDetail',
      detail_params: { component_id: componentId },
      suggested_action_key: 'attention.suggested.reviewComponent',
    }));
  }
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {Array<object>} components
 * @param {object} assessmentContext
 */
function addComponentAttentionItems(push, item, components, assessmentContext) {
  for (const comp of components ?? []) {
    addSingleComponentAttentionItems(push, item, comp, assessmentContext);
  }
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {object|null} dataVoid
 */
function addClusterAttentionItems(push, item, dataVoid) {
  const clusters = dataVoid?.affected_clusters;
  if (Array.isArray(clusters) && clusters.length > 0) {
    push(item('info', 'data_void:clusters', 'affected_clusters', 'attention.dataVoid.clusters', {
      detail_key: 'attention.dataVoid.clustersDetail',
      detail_params: { n: clusters.length },
    }));
  }
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {object|null} socialQuarantine
 */
function addSocialQuarantineAttentionItems(push, item, socialQuarantine) {
  if (!socialQuarantine) return;

  const osintCount = socialQuarantine.osint_signal_count
    ?? socialQuarantine.social_signal_count
    ?? 0;
  const osintPol = socialQuarantine.osint_polarization
    ?? socialQuarantine.social_polarization
    ?? null;
  const osintShare = socialQuarantine.osint_share
    ?? socialQuarantine.social_share
    ?? null;

  if (socialQuarantine.auto_excluded === true) {
    push(item('warning', 'social:quarantine_auto', 'osint_quarantine_auto', 'attention.social.quarantineAuto', {
      detail_key: 'attention.social.quarantineAutoDetail',
      detail_params: {
        n: osintCount,
        polarization: osintPol,
        telegram: socialQuarantine.telegram_signal_count ?? 0,
      },
      suggested_action_key: 'attention.suggested.reviewEvidence',
    }));
    return;
  }
  if (socialQuarantine.active === true) {
    push(item('warning', 'social:quarantine_active', 'social_quarantine_active', 'attention.social.quarantineActive', {
      detail_key: 'attention.social.quarantineActiveDetail',
      detail_params: {
        n: osintCount,
        polarization: osintPol,
      },
      suggested_action_key: 'attention.suggested.reviewEvidence',
    }));
    return;
  }
  if (socialQuarantine.suggested === true) {
    push(item('warning', 'social:quarantine_suggested', 'social_quarantine_suggested', 'attention.social.quarantineSuggested', {
      detail_key: 'attention.social.quarantineSuggestedDetail',
      detail_params: {
        n: osintCount,
        polarization: osintPol,
        share: osintShare,
      },
      suggested_action_key: 'attention.suggested.reviewExtraction',
    }));
  }
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {object} assessment
 */
function addMacroAttentionItems(push, item, assessment) {
  const macroCount = Array.isArray(assessment.macro_signals)
    ? assessment.macro_signals.length
    : (assessment.macro_signals_summary?.count ?? 0);
  if (macroCount > 0) {
    push(item('info', 'macro:signals', 'macro_signals', 'attention.macro.signals', {
      detail_key: 'attention.macro.signalsDetail',
      detail_params: { n: macroCount },
    }));
  }
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {object} assessment
 * @param {boolean} isAnalyst
 * @param {object|null} methodology
 */
function addOovAttentionItems(push, item, assessment, isAnalyst, methodology) {
  const oovBurst = assessment.oov_burst ?? null;
  if (oovBurst?.alert === true) {
    const burstLevel = oovBurst.level === 'critical' ? 'critical' : 'warning';
    const keywords = Array.isArray(oovBurst.top_cluster_keywords)
      ? oovBurst.top_cluster_keywords.join(', ')
      : null;
    push(item(burstLevel, 'oov:burst', 'oov_burst', 'attention.oov.burst', {
      detail_key: keywords ? 'attention.oov.burstDetailKeywords' : 'attention.oov.burstDetail',
      detail_params: {
        n: oovBurst.total ?? 0,
        cluster: oovBurst.top_cluster_key ?? null,
        cluster_n: oovBurst.top_cluster_count ?? 0,
        keywords: keywords ?? '',
        window_hours: oovBurst.window_hours ?? 2,
      },
      suggested_action_key: 'attention.suggested.reviewExtraction',
    }));
  }

  const oovScoring = assessment.oov_scoring_applied ?? null;
  if (oovScoring?.synthetic_count > 0) {
    push(item('info', 'oov:scoring', 'oov_scoring_applied', 'attention.oov.scoringApplied', {
      detail_key: 'attention.oov.scoringAppliedDetail',
      detail_params: {
        n: oovScoring.synthetic_count,
        weight: oovScoring.weight_discount ?? null,
      },
    }));
  }

  if (isAnalyst && (assessment.oov_capture_count ?? 0) > 0) {
    push(item('watch', 'oov:capture', 'oov_capture', 'attention.oov.capture', {
      detail_key: 'attention.oov.captureDetail',
      detail_params: { n: assessment.oov_capture_count },
      suggested_action_key: 'attention.suggested.reviewExtraction',
    }));
  }

  if (isAnalyst && (methodology?.calibration?.deficit ?? 0) >= 0.5) {
    push(item('info', 'calibration:deficit', 'calibration_deficit', 'attention.calibration.deficit', {
      detail_key: 'attention.calibration.deficitDetail',
      detail_params: {
        trust: Math.round((methodology.calibration.trust ?? 0) * 100),
        deficit: Math.round((methodology.calibration.deficit ?? 0) * 100),
      },
    }));
  }
}


/**
 * Abstention fatigue: emit a critical attention item when consecutive reports show elevated/critical
 * data void. This prevents operators from habituating to persistent grey/no-data states and
 * reminds them to dispatch field collection to the affected region.
 *
 * @param {Function} push
 * @param {Function} item
 * @param {object} assessment Current assessment
 * @param {Array<object>} priorReports Array of prior assessment objects (newest first), at most 3.
 */
function addAbstentionFatigueItems(push, item, assessment, priorReports) {
  const currentVoid = assessment?.data_void;
  const currentLevel = currentVoid?.level ?? 'none';
  const isAbstaining = currentLevel === 'elevated' || currentLevel === 'critical' || currentVoid?.digital_darkness === true;
  if (!isAbstaining) return;

  const priorAbstaining = (priorReports ?? []).filter((r) => {
    const v = r?.data_void ?? r?.assessment?.data_void;
    const level = v?.level ?? 'none';
    return level === 'elevated' || level === 'critical' || v?.digital_darkness === true;
  });
  if (priorAbstaining.length === 0) return;

  const consecutiveCount = priorAbstaining.length + 1; // current + prior
  const affectedChannels = currentVoid?.affected_channels ?? [];
  const channelList = affectedChannels.length > 0 ? affectedChannels.join(', ') : null;

  push(item('critical', 'data_void:consecutive', 'abstention_fatigue', 'attention.dataVoid.consecutive', {
    detail_key: 'attention.dataVoid.consecutiveDetail',
    detail_params: {
      count: consecutiveCount,
      channels: channelList ?? '—',
    },
    suggested_action_key: 'attention.suggested.dispatchFieldCollection',
  }));
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {Array<object>} patternAlerts
 * @param {Set<string>} [coveredPatternCodes] pattern_codes already shown as pending recommendations
 */
function addPatternAttentionItems(push, item, patternAlerts, coveredPatternCodes) {
  const covered = coveredPatternCodes ?? new Set();
  for (const p of patternAlerts ?? []) {
    if (!p?.id || !p.pattern_code) continue;
    if (covered.has(p.pattern_code)) continue;
    const evidenceRefs = p.evidence_refs ?? [];
    push(item(p.level ?? 'watch', p.id, p.pattern_code, p.title_key, {
      component_id: p.component_id ?? undefined,
      detail_key: p.detail_key ?? null,
      detail_params: p.detail_params ?? {},
      suggested_action_key: p.suggested_action_key ?? null,
      recommendation_id: `rec:${p.pattern_code}`,
      channels: p.recommended_action?.channels ?? null,
      evidence_refs: evidenceRefs,
      evidence_count: evidenceRefs.length,
    }));
  }
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {Array<object>} recommendations
 */
function addOperatorRecommendationItems(push, item, recommendations) {
  for (const rec of recommendations ?? []) {
    if (rec.status !== 'pending') continue;
    const evidenceRefs = rec.evidence_refs ?? [];
    push(item(rec.level ?? 'warning', `recommendation:${rec.id}`, rec.pattern_code, rec.title_key, {
      component_id: rec.component_id ?? undefined,
      detail_key: rec.detail_key ?? null,
      detail_params: rec.detail_params ?? {},
      suggested_action_key: rec.suggested_action_key ?? 'attention.suggested.commsClarification',
      recommendation_id: rec.id,
      channels: rec.recommended_action?.channels ?? null,
      evidence_refs: evidenceRefs,
      evidence_count: evidenceRefs.length,
    }));
  }
}
