/**
 * Section builders for unified attention items (keeps buildAttentionItems complexity low).
 */

import { deriveInstrumentState } from './assessmentDisplayTier.js';
import { THIN_EVIDENCE_INSTRUMENT } from '../../epistemic/thinEvidencePolicy.js';
import { isSoftVoidWarning } from '../../../../../cross-cut-modules/resilience-contracts/softVoidReasons.js';

/**
 * @param {Array<object>} items
 * @param {Set<string>} seenIds
 */
export function createAttentionPush(items, seenIds) {
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
export function addDataVoidAttentionItems(push, item, dataVoid) {
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
export function addEpistemicAttentionItems(push, item, assessment, assessmentMode, epistemicStatus) {
  if (assessmentMode === 'abstained'
    || (epistemicStatus?.sampling_status === 'blind' && assessmentMode === 'abstained')) {
    push(item('critical', 'epistemic:sampling_blind', 'sampling_blind', 'attention.epistemic.samplingBlind', {
      suggested_action_key: 'attention.suggested.fieldCorroboration',
    }));
  }

  if (assessmentMode === 'field_anchor_only') {
    push(item('warning', 'epistemic:field_anchor_only', 'field_anchor_only', 'attention.epistemic.fieldAnchorOnly', {
      detail_key: 'attention.epistemic.fieldAnchorOnlyDetail',
      detail_params: {
        stale_at: assessment.stale_digital_scores?.scored_at ?? null,
      },
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
export function addGeoAttentionItems(push, item, methodology, reportScopeId) {
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
 * @param {boolean} isAnalyst
 * @param {object} assessmentContext
 */
function addSingleComponentAttentionItems(push, item, comp, isAnalyst, assessmentContext) {
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

  if (inst.significant_delta === true) {
    push(item('watch', `component:${componentId}:delta`, 'significant_delta', 'attention.component.significantDelta', {
      component_id: componentId,
      detail_key: 'attention.component.significantDeltaDetail',
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

  if (isAnalyst) {
    addAnalystComponentAttentionItems(push, item, comp, componentId);
  }
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {object} comp
 * @param {string} componentId
 */
function addAnalystComponentAttentionItems(push, item, comp, componentId) {
  const deltaZ = comp.delta_significance;
  if (typeof deltaZ === 'number' && Math.abs(deltaZ) >= 2 && comp.delta_flag !== 'significant') {
    push(item('watch', `component:${componentId}:delta_z`, 'high_delta_z', 'attention.component.highDeltaZ', {
      component_id: componentId,
      detail_key: 'attention.component.highDeltaZDetail',
      detail_params: { component_id: componentId, z: Math.round(deltaZ * 10) / 10 },
      suggested_action_key: 'attention.suggested.reviewComponent',
    }));
  }

  const chronicZ = comp.z_score_chronic;
  if (typeof chronicZ === 'number' && chronicZ <= -2) {
    push(item('warning', `component:${componentId}:chronic`, 'long_term_degradation', 'attention.component.chronicDegradation', {
      component_id: componentId,
      detail_key: 'attention.component.chronicDegradationDetail',
      detail_params: { component_id: componentId, z: Math.round(chronicZ * 10) / 10 },
      suggested_action_key: 'attention.suggested.reviewComponent',
    }));
  }

  const erosion = comp.erosion_index;
  if (typeof erosion === 'number' && erosion > 0.35) {
    push(item('watch', `component:${componentId}:erosion`, 'erosion_elevated', 'attention.component.erosionElevated', {
      component_id: componentId,
      detail_key: 'attention.component.erosionElevatedDetail',
      detail_params: { component_id: componentId, erosion: Math.round(erosion * 100) / 100 },
      suggested_action_key: 'attention.suggested.reviewComponent',
    }));
  }
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {Array<object>} components
 * @param {boolean} isAnalyst
 * @param {object} assessmentContext
 */
export function addComponentAttentionItems(push, item, components, isAnalyst, assessmentContext) {
  for (const comp of components ?? []) {
    addSingleComponentAttentionItems(push, item, comp, isAnalyst, assessmentContext);
  }
}

/**
 * @param {Function} push
 * @param {Function} item
 * @param {object|null} dataVoid
 */
export function addClusterAttentionItems(push, item, dataVoid) {
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
export function addSocialQuarantineAttentionItems(push, item, socialQuarantine) {
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
export function addMacroAttentionItems(push, item, assessment) {
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
export function addOovAttentionItems(push, item, assessment, isAnalyst, methodology) {
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

export { DISPLAY_VIEWS } from './assessmentDisplayTier.js';

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
export function addAbstentionFatigueItems(push, item, assessment, priorReports) {
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
export function addPatternAttentionItems(push, item, patternAlerts, coveredPatternCodes) {
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
export function addOperatorRecommendationItems(push, item, recommendations) {
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
