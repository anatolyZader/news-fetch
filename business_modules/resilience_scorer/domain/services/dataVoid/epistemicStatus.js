/**
 * Deterministic epistemic status derived from data void outcome.
 */

const LEVEL_ORDER = { none: 0, warning: 1, elevated: 2, critical: 3 };

/**
 * @param {object|null|undefined} dataVoid
 * @param {{ assessmentMode?: string, voidStatus?: string }} [opts]
 * @returns {object}
 */
export function buildEpistemicStatus(dataVoid, opts = {}) {
  const voidStatus = opts.voidStatus ?? dataVoid?.void_status ?? 'active';

  if (voidStatus === 'unavailable') {
    return {
      sampling_status: 'degraded',
      void_level: 'none',
      scores_reliable: false,
      reason: 'void_baseline_unavailable',
      assessment_mode: opts.assessmentMode ?? 'normal',
      void_status: 'unavailable',
    };
  }

  if (voidStatus === 'disabled' || !dataVoid) {
    return {
      sampling_status: 'normal',
      void_level: 'none',
      scores_reliable: true,
      reason: null,
      assessment_mode: opts.assessmentMode ?? 'normal',
      void_status: voidStatus,
    };
  }

  const level = dataVoid.level ?? 'none';
  const assessmentMode = opts.assessmentMode ?? 'normal';

  if (assessmentMode === 'field_anchor_only') {
    return {
      sampling_status: 'degraded',
      void_level: level,
      scores_reliable: true,
      reason: dataVoid.reason ?? 'digital_darkness',
      assessment_mode: 'field_anchor_only',
      void_status: 'active',
    };
  }

  if (assessmentMode === 'abstained') {
    return {
      sampling_status: 'blind',
      void_level: level,
      scores_reliable: false,
      reason: dataVoid.reason ?? 'epistemic_abstention',
      assessment_mode: 'abstained',
      void_status: 'active',
    };
  }

  if (level === 'critical' && !dataVoid.digital_darkness) {
    return {
      sampling_status: 'blind',
      void_level: level,
      scores_reliable: false,
      reason: dataVoid.reason ?? 'critical_void',
      assessment_mode: 'abstained',
      void_status: 'active',
    };
  }

  if (level === 'elevated') {
    return {
      sampling_status: 'blind',
      void_level: level,
      scores_reliable: false,
      reason: dataVoid.reason ?? 'elevated_void',
      assessment_mode: 'abstained',
      void_status: 'active',
    };
  }

  if (level === 'warning') {
    return {
      sampling_status: 'degraded',
      void_level: level,
      scores_reliable: true,
      reason: dataVoid.reason ?? 'digital_volume_drop',
      assessment_mode: 'normal',
      void_status: 'active',
    };
  }

  return {
    sampling_status: 'normal',
    void_level: 'none',
    scores_reliable: true,
    reason: null,
    assessment_mode: 'normal',
    void_status: 'active',
  };
}

/**
 * @param {string} levelA
 * @param {string} levelB
 * @returns {string}
 */
export function maxVoidLevel(levelA, levelB) {
  return (LEVEL_ORDER[levelA] ?? 0) >= (LEVEL_ORDER[levelB] ?? 0) ? levelA : levelB;
}
