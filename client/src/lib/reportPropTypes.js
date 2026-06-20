import PropTypes from 'prop-types';

/** i18n lookup from useLanguage(). */
export const translationFnPropType = PropTypes.func.isRequired;

export const sourceKindPropType = PropTypes.oneOf([
  'field',
  'radio',
  'naftali',
  'press',
  'pbo',
  'social',
]);

export const componentScoreShape = PropTypes.shape({
  component_id: PropTypes.string,
  score: PropTypes.number,
  score_low: PropTypes.number,
  score_high: PropTypes.number,
  score_smoothed: PropTypes.number,
  score_raw: PropTypes.number,
  score_headline: PropTypes.number,
  confidence: PropTypes.string,
  delta_score: PropTypes.number,
  delta_flag: PropTypes.string,
  delta_significance: PropTypes.number,
  counterfactual_delta: PropTypes.number,
  floor_clamped: PropTypes.bool,
  ci_unstable: PropTypes.bool,
  top_contributors: PropTypes.arrayOf(PropTypes.object),
  instrument: PropTypes.object,
  polarization: PropTypes.number,
  evidence_mass: PropTypes.number,
  narrative: PropTypes.string,
  narrative_claims: PropTypes.arrayOf(PropTypes.object),
  data_quality_caveat: PropTypes.string,
  narrative_grounding_score: PropTypes.number,
  grounding_issues: PropTypes.arrayOf(PropTypes.object),
  interpretive_summary: PropTypes.bool,
  evidence: PropTypes.arrayOf(PropTypes.string),
  evidence_operator: PropTypes.arrayOf(PropTypes.string),
  evidence_tree: PropTypes.arrayOf(PropTypes.object),
  reasoning_trace_id: PropTypes.string,
  severity: PropTypes.string,
  dissent_summary: PropTypes.string,
  facets: PropTypes.object,
  manifestations_absent: PropTypes.arrayOf(PropTypes.string),
  media_mention_mass: PropTypes.number,
  suppression_delta: PropTypes.number,
  suppression_breakdown: PropTypes.object,
  score_calibrated: PropTypes.number,
  calibration_trust: PropTypes.number,
  calibration_deficit: PropTypes.number,
  weight_sensitivity: PropTypes.object,
  weight_sensitivity_note: PropTypes.string,
  operator_display_state: PropTypes.oneOf([
    'assessed_claims',
    'assessed_low_confidence',
    'specialist_skipped',
    'evidence_quarantined',
    'insufficient_data',
  ]),
  operator_state_reason: PropTypes.string,
  evidence_usage_state: PropTypes.oneOf([
    'normal',
    'field_anchor_only',
    'quarantined_digital_present',
    'macro_context_only',
    'scope_excluded_only',
    'mixed',
  ]),
  coverage: PropTypes.shape({
    scoring_used: PropTypes.number,
    investigation_used: PropTypes.number,
    scoring_quarantined: PropTypes.number,
    quarantined: PropTypes.number,
    macro_context: PropTypes.number,
    excluded_by_scope: PropTypes.number,
    claims: PropTypes.number,
  }),
  specialist_tier: PropTypes.oneOf(['A', 'B', 'C']),
  specialist_ran: PropTypes.bool,
  assessment_state: PropTypes.string,
  analyst_flags: PropTypes.arrayOf(PropTypes.string),
});

export const assessmentShape = PropTypes.shape({
  overall_resilience_score: PropTypes.number,
  overall_score_calibrated: PropTypes.number,
  components: PropTypes.arrayOf(componentScoreShape),
  norris_capacities: PropTypes.arrayOf(PropTypes.object),
  cross_component_synthesis: PropTypes.string,
  investigation_summary: PropTypes.shape({
    agent_ran: PropTypes.bool,
    degrade_reason: PropTypes.string,
    synthesis_mode: PropTypes.string,
    budget_degrade_mode: PropTypes.string,
    signals_investigation: PropTypes.number,
    signals_narrative_scope: PropTypes.number,
    signals_national_context: PropTypes.number,
    signals_scoring_quarantined: PropTypes.number,
    shadow_scoring_available: PropTypes.bool,
  }),
  synthesis_mode: PropTypes.string,
  degrade_reason: PropTypes.string,
  narrative_grounding_summary: PropTypes.shape({
    mean_score: PropTypes.number,
    synthesis_score: PropTypes.number,
    components_below_threshold: PropTypes.arrayOf(PropTypes.string),
    threshold: PropTypes.number,
  }),
  media_bias_caveats: PropTypes.string,
  macro_signals: PropTypes.arrayOf(PropTypes.object),
  macro_signals_summary: PropTypes.shape({
    count: PropTypes.number,
  }),
  national_context_signals: PropTypes.arrayOf(PropTypes.object),
  national_context_summary: PropTypes.shape({
    count: PropTypes.number,
    provenance_counts: PropTypes.object,
  }),
  scope_attribution: PropTypes.shape({
    default_district_signal_count: PropTypes.number,
    default_district_pct: PropTypes.number,
    gate_threshold_pct: PropTypes.number,
    gate_warning: PropTypes.bool,
  }),
  default_district_signal_count: PropTypes.number,
  narrative_scope_signal_count: PropTypes.number,
  north_cluster_narratives: PropTypes.object,
  oov_capture_count: PropTypes.number,
  oov_burst: PropTypes.shape({
    alert: PropTypes.bool,
    level: PropTypes.string,
    total: PropTypes.number,
    window_hours: PropTypes.number,
    clustering_method: PropTypes.string,
    top_cluster_key: PropTypes.string,
    top_cluster_count: PropTypes.number,
    top_cluster_keywords: PropTypes.arrayOf(PropTypes.string),
    salience_bypass: PropTypes.bool,
    cluster_threshold: PropTypes.number,
    top_clusters: PropTypes.arrayOf(PropTypes.object),
  }),
  oov_scoring_applied: PropTypes.shape({
    synthetic_count: PropTypes.number,
    clusters_scored: PropTypes.arrayOf(PropTypes.string),
    weight_discount: PropTypes.number,
  }),
  social_channel_quarantine: PropTypes.shape({
    suggested: PropTypes.bool,
    active: PropTypes.bool,
    auto_excluded: PropTypes.bool,
    reason: PropTypes.string,
    osint_signal_count: PropTypes.number,
    osint_polarization: PropTypes.number,
    osint_share: PropTypes.number,
    telegram_signal_count: PropTypes.number,
    social_signal_count: PropTypes.number,
    social_polarization: PropTypes.number,
    social_share: PropTypes.number,
    confirmed_at: PropTypes.string,
  }),
  methodology: PropTypes.object,
  data_void: PropTypes.object,
  quarantined_digital: PropTypes.shape({
    count: PropTypes.number,
    reason: PropTypes.string,
    by_source_type: PropTypes.object,
    sample_evidence: PropTypes.arrayOf(PropTypes.string),
  }),
  digital_quarantine_state: PropTypes.shape({
    active: PropTypes.bool,
    reason: PropTypes.string,
    since: PropTypes.string,
    scope: PropTypes.string,
    quarantined_count: PropTypes.number,
    expires: PropTypes.string,
  }),
  report_scope: PropTypes.shape({
    label: PropTypes.string,
    id: PropTypes.string,
  }),
});

export const scoreBySourceShape = PropTypes.objectOf(
  PropTypes.objectOf(
    PropTypes.shape({
      signals: PropTypes.arrayOf(PropTypes.object),
    }),
  ),
);

export const driftByComponentShape = PropTypes.objectOf(
  PropTypes.shape({
    series: PropTypes.array,
  }),
);

export const macroSignalShape = PropTypes.shape({
  signal_type: PropTypes.string,
  type: PropTypes.string,
  evidence: PropTypes.string,
});

export const facetsShape = PropTypes.objectOf(
  PropTypes.shape({
    score: PropTypes.number,
    signal_count: PropTypes.number,
  }),
);

export const statusTagVariantPropType = PropTypes.oneOf([
  'neutral',
  'success',
  'warning',
  'error',
  'alert',
  'info',
]);
