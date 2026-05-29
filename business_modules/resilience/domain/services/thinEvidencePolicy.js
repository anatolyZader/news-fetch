/**
 * Option C — hybrid thin-evidence operator policy.
 * @see docs/MODEL-CARD.md
 */

import { UNVERIFIED_CRITICAL_GROUNDING_REASON } from './groundingPolicy.js';

export const THIN_EVIDENCE_INSTRUMENT = Object.freeze({
  insufficient_data: 'insufficient_data',
  limited_evidence_neutral: 'limited_evidence_neutral',
  unverified_alert: 'unverified_alert',
  critical_single_signal: 'critical_single_signal',
  critical_presence_failure: 'critical_presence_failure',
  adequate: 'adequate',
  sampling_blind: 'sampling_blind',
});

const MIN_MASS = 1.5;

/**
 * Assessment-level epistemic policy from data void / epistemic_status.
 * @param {object|null|undefined} dataVoid
 * @param {object|null|undefined} epistemicStatus
 * @returns {{ globalOperatorShowsScore: boolean, instrumentDefault: string|null }}
 */
export function deriveAssessmentEpistemicPolicy(dataVoid, epistemicStatus) {
  const status = epistemicStatus ?? null;
  const mode = status?.assessment_mode ?? 'normal';
  const sampling = status?.sampling_status ?? 'normal';

  if (sampling === 'blind' || mode === 'abstained') {
    return {
      globalOperatorShowsScore: false,
      instrumentDefault: THIN_EVIDENCE_INSTRUMENT.sampling_blind,
    };
  }

  if (mode === 'field_anchor_only' || dataVoid?.digital_darkness === true) {
    return {
      globalOperatorShowsScore: true,
      instrumentDefault: null,
    };
  }

  if (sampling === 'degraded' || (dataVoid?.level && dataVoid.level !== 'none')) {
    return {
      globalOperatorShowsScore: true,
      instrumentDefault: null,
    };
  }

  return { globalOperatorShowsScore: true, instrumentDefault: null };
}

/**
 * @param {object} comp — scored component (pre-operator redaction)
 * @param {{ assessmentEpistemic?: { globalOperatorShowsScore: boolean, instrumentDefault: string|null } }} [ctx]
 * @returns {{ instrument: string, operatorShowsScore: boolean, contested_thin: boolean }}
 */
export function deriveThinEvidencePolicy(comp, ctx = {}) {
  const assessmentEpistemic = ctx.assessmentEpistemic ?? null;

  if (assessmentEpistemic?.globalOperatorShowsScore === false) {
    return {
      instrument: assessmentEpistemic.instrumentDefault ?? THIN_EVIDENCE_INSTRUMENT.sampling_blind,
      operatorShowsScore: false,
      contested_thin: false,
    };
  }

  const mass = Number(comp?.evidence_mass ?? 0);
  const confidence = comp?.confidence ?? 'insufficient_data';

  if (comp?.epistemic_abstention === true || confidence === 'insufficient_data' || comp?.score == null) {
    return { instrument: THIN_EVIDENCE_INSTRUMENT.insufficient_data, operatorShowsScore: false, contested_thin: false };
  }

  if (comp?.presence_gate_triggered === true || comp?.operator_status === 'critical_failure') {
    return {
      instrument: THIN_EVIDENCE_INSTRUMENT.critical_presence_failure,
      operatorShowsScore: false,
      contested_thin: false,
    };
  }

  if (comp?.salience_critical === true) {
    const reasons = comp?.salience_bypass_reasons ?? [];
    if (reasons.includes(UNVERIFIED_CRITICAL_GROUNDING_REASON)) {
      return {
        instrument: THIN_EVIDENCE_INSTRUMENT.unverified_alert,
        operatorShowsScore: false,
        contested_thin: false,
      };
    }
    return {
      instrument: THIN_EVIDENCE_INSTRUMENT.critical_single_signal,
      operatorShowsScore: true,
      contested_thin: false,
    };
  }

  const contestedThin = comp?.polarization != null
    && comp.polarization > 0.5
    && mass >= MIN_MASS
    && mass < 4;

  if (mass < MIN_MASS) {
    if (comp?.floor_clamped === true) {
      return {
        instrument: THIN_EVIDENCE_INSTRUMENT.unverified_alert,
        operatorShowsScore: false,
        contested_thin: false,
      };
    }
    return {
      instrument: THIN_EVIDENCE_INSTRUMENT.limited_evidence_neutral,
      operatorShowsScore: false,
      contested_thin: contestedThin,
    };
  }

  if (contestedThin) {
    return { instrument: THIN_EVIDENCE_INSTRUMENT.limited_evidence_neutral, operatorShowsScore: false, contested_thin: true };
  }

  return { instrument: THIN_EVIDENCE_INSTRUMENT.adequate, operatorShowsScore: true, contested_thin: false };
}

export function isThinEvidencePolicyEnabled() {
  return process.env.RESILIENCE_THIN_EVIDENCE_POLICY !== '0';
}
