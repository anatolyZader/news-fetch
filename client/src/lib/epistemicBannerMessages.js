/**
 * Derive epistemic status banner messages for the report UI.
 * @param {object | null | undefined} assessment
 * @param {{ displayView?: 'operator' | 'analyst', attentionItemIds?: Set<string> | string[], suggestCrisisBudget?: boolean }} [opts]
 * @returns {Array<{ id: string, severity: 'info' | 'warning' | 'error', messageKey: string, params?: Record<string, string|number|null> }>}
 */

function resolveAttentionIds(attentionItemIds) {
  if (Array.isArray(attentionItemIds)) return new Set(attentionItemIds);
  if (attentionItemIds instanceof Set) return new Set(attentionItemIds);
  return new Set();
}

function createBannerCollector() {
  const messages = [];
  const seen = new Set();
  const push = (entry) => {
    if (!entry?.id || seen.has(entry.id)) return;
    seen.add(entry.id);
    messages.push(entry);
  };
  return { messages, push };
}

function addDataVoidBanner(push, isAnalyst, dataVoid, voidLevel, attentionIds) {
  if (isAnalyst) return;
  const elevated = voidLevel === 'elevated' || voidLevel === 'critical' || dataVoid?.digital_darkness === true;
  if (!elevated) return;
  if (attentionIds.has('data_void:critical') || attentionIds.has(`data_void:${voidLevel}`)) return;
  push({
    id: 'data_void:banner',
    severity: voidLevel === 'critical' || dataVoid?.digital_darkness ? 'error' : 'warning',
    messageKey: 'report.dataVoid.banner',
    params: {
      level: voidLevel,
      digital: dataVoid?.digital_darkness ? 'yes' : 'no',
    },
  });
}

function addAssessmentModeBanners(push, assessmentMode, epistemicStatus, attentionIds) {
  if (assessmentMode === 'field_anchor_only' && !attentionIds.has('epistemic:field_anchor_only')) {
    push({
      id: 'epistemic:field_anchor_only',
      severity: 'warning',
      messageKey: 'report.epistemicStatus.fieldAnchorOnly',
    });
  }

  if (assessmentMode === 'abstained' || epistemicStatus?.sampling_status === 'blind') {
    if (!attentionIds.has('epistemic:sampling_blind')) {
      push({
        id: 'epistemic:sampling_blind',
        severity: 'error',
        messageKey: 'report.epistemicStatus.samplingBlind',
      });
    }
    return;
  }

  if (epistemicStatus?.sampling_status !== 'degraded') return;
  push({
    id: 'epistemic:sampling_degraded',
    severity: 'warning',
    messageKey: 'report.epistemicStatus.sampling',
    params: { status: epistemicStatus.sampling_status },
  });
  if (epistemicStatus.reason) {
    push({
      id: 'epistemic:reason',
      severity: 'warning',
      messageKey: 'report.epistemicStatus.reason',
      params: { reason: epistemicStatus.reason },
    });
  }
}

function addSocialQuarantineBanners(push, socialQ, attentionIds) {
  if (!socialQ) return;

  if (socialQ.auto_excluded === true && !attentionIds.has('social:quarantine_auto')) {
    push({
      id: 'social:quarantine_auto',
      severity: 'warning',
      messageKey: 'report.socialQuarantine.autoExcluded',
      params: {
        n: socialQ.osint_signal_count ?? socialQ.social_signal_count ?? 0,
        polarization: socialQ.osint_polarization ?? socialQ.social_polarization ?? null,
      },
    });
  } else if (socialQ.suggested === true && !socialQ.active && !attentionIds.has('social:quarantine_suggested')) {
    push({
      id: 'social:quarantine_suggested',
      severity: 'warning',
      messageKey: 'report.socialQuarantine.suggested',
      params: {
        n: socialQ.social_signal_count ?? 0,
        polarization: socialQ.social_polarization ?? null,
      },
    });
  }

  if (socialQ.active === true && !attentionIds.has('social:quarantine_active')) {
    push({
      id: 'social:quarantine_active',
      severity: 'warning',
      messageKey: 'report.socialQuarantine.active',
    });
  }
}

function addDigitalQuarantineBanners(push, assessment, attentionIds) {
  if (assessment.stale_digital_scores?.scored_at && !attentionIds.has('epistemic:field_anchor_only')) {
    push({
      id: 'epistemic:stale_digital',
      severity: 'warning',
      messageKey: 'report.epistemicStatus.staleAt',
      params: { at: assessment.stale_digital_scores.scored_at },
    });
  }

  const quarantinedDigital = assessment.quarantined_digital ?? null;
  if ((quarantinedDigital?.count ?? 0) > 0 && !attentionIds.has('epistemic:quarantined_digital')) {
    push({
      id: 'epistemic:quarantined_digital',
      severity: 'warning',
      messageKey: 'report.quarantinedDigital.banner',
      params: {
        n: quarantinedDigital.count,
        reason: quarantinedDigital.reason ?? 'isolation',
      },
    });
  }

  const persistedQ = assessment.digital_quarantine_state ?? null;
  // Avoid stacking: the field-anchor-only banner already states digital channels
  // are quarantined; don't repeat it as a separate persisted-quarantine line.
  const fieldAnchorActive = (assessment.assessment_mode ?? 'normal') === 'field_anchor_only';
  if (persistedQ?.active === true && !fieldAnchorActive && !attentionIds.has('epistemic:persisted_quarantine')) {
    push({
      id: 'epistemic:persisted_quarantine',
      severity: 'warning',
      messageKey: 'report.quarantinedDigital.persisted',
      params: { reason: persistedQ.reason ?? 'prior_quarantine' },
    });
  }
}

function addGeoQualityBanner(push, isAnalyst, methodology, assessment, attentionIds) {
  const geoMetricsSafePct = methodology?.scope?.geo_quality_summary?.pctUsableForMetrics ?? null;
  const scopeId = assessment.report_scope?.id ?? 'national';
  if (
    isAnalyst
    || geoMetricsSafePct == null
    || geoMetricsSafePct >= 75
    || scopeId === 'national'
    || attentionIds.has('geo:low_metrics_safe')
  ) {
    return;
  }
  push({
    id: 'geo:low_metrics_safe',
    severity: 'warning',
    messageKey: 'report.methodology.northGeoQualityWarning',
    params: { pct: Math.round(geoMetricsSafePct) },
  });
}

function addCalibrationBanner(push, methodology) {
  const calibration = methodology?.calibration ?? null;
  if (calibration?.deficit == null || calibration.deficit < 0.5) return;
  push({
    id: 'calibration:limited',
    severity: 'info',
    messageKey: 'report.calibration.banner',
    params: {
      trust: Math.round((calibration.trust ?? 0) * 100),
      deficit: Math.round((calibration.deficit ?? 0) * 100),
    },
  });
}

function addAssessmentDegradedBanner(push, assessment, attentionIds) {
  const degraded = assessment.assessment_degraded ?? null;
  if (!degraded?.mode) return;

  if (degraded.mode === 'cached' && !attentionIds.has('assessment:degraded_cached')) {
    push({
      id: 'assessment:degraded_cached',
      severity: 'error',
      messageKey: 'report.assessmentDegraded.cached',
      params: {
        date: degraded.cached_date ?? assessment.date ?? '',
        reason: degraded.reason ?? '',
      },
    });
    return;
  }

  if (degraded.mode === 'deterministic' && !attentionIds.has('assessment:degraded_deterministic')) {
    push({
      id: 'assessment:degraded_deterministic',
      severity: 'warning',
      messageKey: 'report.assessmentDegraded.deterministic',
      params: { reason: degraded.reason ?? '' },
    });
  }
}

function addNorrisDisclaimer(push, isAnalyst, assessment) {
  if (isAnalyst && Array.isArray(assessment.norris_capacities) && assessment.norris_capacities.length > 0) {
    push({
      id: 'methodology:norris_disclaimer',
      severity: 'info',
      messageKey: 'report.methodology.norrisDisclaimer',
    });
  }
}

/**
 * Warn when report data is stale (> 4 hours old).
 * Uses `generated_at` ISO string from the top-level payload (not the assessment sub-object).
 */
function addDataFreshnessBanner(push, generatedAt) {
  if (!generatedAt || typeof generatedAt !== 'string') return;
  try {
    const ageMs = Date.now() - new Date(generatedAt).getTime();
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
    if (ageMs < FOUR_HOURS_MS) return;
    const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
    push({
      id: 'report:data_stale',
      severity: 'warning',
      messageKey: 'report.dataFreshness.stale',
      params: { hours: ageHours, generated_at: generatedAt },
    });
  } catch {
    /* ignore unparseable dates */
  }
}

/**
 * @param {object | null | undefined} assessment
 * @param {{ displayView?: 'operator' | 'analyst', attentionItemIds?: Set<string> | string[], suggestCrisisBudget?: boolean, generatedAt?: string }} [opts]
 *   `generatedAt` — ISO timestamp from the top-level report payload (`payload.generated_at`).
 */
export function deriveEpistemicBannerMessages(assessment, opts = {}) {
  if (!assessment || typeof assessment !== 'object') return [];

  const displayView = opts.displayView === 'analyst' ? 'analyst' : 'operator';
  const isAnalyst = displayView === 'analyst';
  const attentionIds = resolveAttentionIds(opts.attentionItemIds);
  const { messages, push } = createBannerCollector();

  const methodology = assessment.methodology ?? null;
  const dataVoid = assessment.data_void ?? null;
  const epistemicStatus = assessment.epistemic_status ?? null;
  const assessmentMode = assessment.assessment_mode ?? 'normal';
  const voidLevel = dataVoid?.level ?? 'none';

  addAssessmentDegradedBanner(push, assessment, attentionIds);
  addDataFreshnessBanner(push, opts.generatedAt ?? null);
  addDataVoidBanner(push, isAnalyst, dataVoid, voidLevel, attentionIds);
  addAssessmentModeBanners(push, assessmentMode, epistemicStatus, attentionIds);
  addSocialQuarantineBanners(push, assessment.social_channel_quarantine ?? null, attentionIds);
  addDigitalQuarantineBanners(push, assessment, attentionIds);
  addGeoQualityBanner(push, isAnalyst, methodology, assessment, attentionIds);
  addCalibrationBanner(push, methodology);
  addNorrisDisclaimer(push, isAnalyst, assessment);

  if (!isAnalyst && opts.suggestCrisisBudget === true) {
    push({
      id: 'budget:crisis_suggest',
      severity: 'warning',
      messageKey: 'crisisBudget.operatorBanner',
    });
  }

  return messages;
}

/**
 * Count evidence sufficiency buckets from component instruments.
 * @param {object | null | undefined} assessment
 */
export function deriveEvidenceOverviewCounts(assessment) {
  const components = assessment?.components ?? [];
  let adequate = 0;
  let thin = 0;
  let contested = 0;
  let significant = 0;

  for (const c of components) {
    const inst = c.instrument ?? {};
    if (inst.evidence_sufficiency === 'adequate') adequate += 1;
    else if (inst.evidence_sufficiency === 'thin') thin += 1;
    if (inst.contested || inst.contested_thin) contested += 1;
    if (inst.significant_delta) significant += 1;
  }

  return {
    total: components.length,
    adequate,
    thin,
    contested,
    significant,
  };
}
