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
  evidence: PropTypes.arrayOf(PropTypes.string),
  facets: PropTypes.object,
  manifestations_absent: PropTypes.arrayOf(PropTypes.string),
  media_mention_mass: PropTypes.number,
  suppression_delta: PropTypes.number,
  suppression_breakdown: PropTypes.object,
});

export const assessmentShape = PropTypes.shape({
  overall_resilience_score: PropTypes.number,
  components: PropTypes.arrayOf(componentScoreShape),
  norris_capacities: PropTypes.arrayOf(PropTypes.object),
  cross_component_synthesis: PropTypes.string,
  media_bias_caveats: PropTypes.string,
  macro_signals: PropTypes.arrayOf(PropTypes.object),
  macro_signals_summary: PropTypes.shape({
    count: PropTypes.number,
  }),
  oov_capture_count: PropTypes.number,
  methodology: PropTypes.object,
  data_void: PropTypes.object,
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
