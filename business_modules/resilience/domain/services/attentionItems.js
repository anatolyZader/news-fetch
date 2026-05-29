/**
 * Derive unified attention items from a (possibly redacted) assessment for operator/analyst UI.
 */

import { DISPLAY_VIEWS, deriveInstrumentState } from './assessmentDisplayTier.js';
import { THIN_EVIDENCE_INSTRUMENT } from './thinEvidencePolicy.js';

export const ATTENTION_LEVELS = Object.freeze({
  critical: 0,
  warning: 1,
  watch: 2,
  info: 3,
});

const LEVEL_ORDER = ['critical', 'warning', 'watch', 'info'];

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
 * @param {object} a
 * @param {object} b
 */
function compareAttentionItems(a, b) {
  const la = ATTENTION_LEVELS[a.level] ?? 99;
  const lb = ATTENTION_LEVELS[b.level] ?? 99;
  if (la !== lb) return la - lb;
  const ca = a.component_id ?? '';
  const cb = b.component_id ?? '';
  if (ca !== cb) return ca.localeCompare(cb);
  return String(a.code).localeCompare(String(b.code));
}

/**
 * @param {object | null | undefined} assessment
 * @param {{ view?: 'operator' | 'analyst', reportScopeId?: string }} [opts]
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

  function push(entry) {
    if (!entry?.id || seenIds.has(entry.id)) return;
    seenIds.add(entry.id);
    items.push(entry);
  }

  const dataVoid = assessment.data_void ?? null;
  const epistemicStatus = assessment.epistemic_status ?? null;
  const assessmentMode = assessment.assessment_mode ?? 'normal';
  const methodology = assessment.methodology ?? null;

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
  } else if (voidLevel === 'elevated' || voidLevel === 'warning') {
    push(item('warning', `data_void:${voidLevel}`, 'data_void_drop', 'attention.dataVoid.warning', {
      detail_key: 'attention.dataVoid.warningDetail',
      detail_params: {
        level: voidLevel,
        reason: dataVoid?.reason ?? null,
      },
      suggested_action_key: 'attention.suggested.reviewEvidence',
    }));
  }

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

  const geoQuality = methodology?.scope?.geo_quality_summary ?? null;
  const geoMetricsSafePct = geoQuality?.pctUsableForMetrics ?? null;
  if (geoMetricsSafePct != null && geoMetricsSafePct < 75 && reportScopeId !== 'national') {
    push(item('warning', 'geo:low_metrics_safe', 'geo_quality_low', 'attention.geo.lowMetricsSafe', {
      detail_key: 'attention.geo.lowMetricsSafeDetail',
      detail_params: { pct: Math.round(geoMetricsSafePct) },
    }));
  }

  const assessmentContext = {
    dataVoid,
    epistemicStatus,
  };

  for (const comp of assessment.components ?? []) {
    const componentId = comp.component_id;
    if (!componentId) continue;

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

    if (isAnalyst) {
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
  }

  const clusters = dataVoid?.affected_clusters;
  if (Array.isArray(clusters) && clusters.length > 0) {
    push(item('info', 'data_void:clusters', 'affected_clusters', 'attention.dataVoid.clusters', {
      detail_key: 'attention.dataVoid.clustersDetail',
      detail_params: { n: clusters.length },
    }));
  }

  const socialQuarantine = assessment.social_channel_quarantine ?? null;
  const osintCount = socialQuarantine?.osint_signal_count
    ?? socialQuarantine?.social_signal_count
    ?? 0;
  const osintPol = socialQuarantine?.osint_polarization
    ?? socialQuarantine?.social_polarization
    ?? null;
  const osintShare = socialQuarantine?.osint_share
    ?? socialQuarantine?.social_share
    ?? null;

  if (socialQuarantine?.auto_excluded === true) {
    push(item('warning', 'social:quarantine_auto', 'osint_quarantine_auto', 'attention.social.quarantineAuto', {
      detail_key: 'attention.social.quarantineAutoDetail',
      detail_params: {
        n: osintCount,
        polarization: osintPol,
        telegram: socialQuarantine.telegram_signal_count ?? 0,
      },
      suggested_action_key: 'attention.suggested.reviewEvidence',
    }));
  } else if (socialQuarantine?.active === true) {
    push(item('warning', 'social:quarantine_active', 'social_quarantine_active', 'attention.social.quarantineActive', {
      detail_key: 'attention.social.quarantineActiveDetail',
      detail_params: {
        n: osintCount,
        polarization: osintPol,
      },
      suggested_action_key: 'attention.suggested.reviewEvidence',
    }));
  } else if (socialQuarantine?.suggested === true) {
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

  const macroCount = Array.isArray(assessment.macro_signals)
    ? assessment.macro_signals.length
    : (assessment.macro_signals_summary?.count ?? 0);
  if (macroCount > 0) {
    push(item('info', 'macro:signals', 'macro_signals', 'attention.macro.signals', {
      detail_key: 'attention.macro.signalsDetail',
      detail_params: { n: macroCount },
    }));
  }

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

  items.sort(compareAttentionItems);
  return items;
}
