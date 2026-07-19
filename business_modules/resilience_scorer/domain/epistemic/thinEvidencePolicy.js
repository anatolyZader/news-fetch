/**
 * Thin-evidence instrument policy — count-based.
 *
 * Decides which qualitative instrument a component presents and whether the
 * report shows a full assessment for it, from `evidence_basis.sufficiency`
 * and `.balance` (see domain/contracts/componentEvidence.js). No evidence
 * mass, no score floors.
 */

import { UNVERIFIED_CRITICAL_GROUNDING_REASON } from '../services/signals/groundingPolicy.js';
import { isSoftVoidWarning } from '../contracts/softVoidReasons.js';

export const THIN_EVIDENCE_INSTRUMENT = Object.freeze({
  insufficient_data: 'insufficient_data',
  limited_evidence_neutral: 'limited_evidence_neutral',
  unverified_alert: 'unverified_alert',
  critical_single_signal: 'critical_single_signal',
  critical_presence_failure: 'critical_presence_failure',
  adequate: 'adequate',
  sampling_blind: 'sampling_blind',
});

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

  if (mode === 'field_anchor_only'
    || dataVoid?.digital_darkness === true
    || isSoftVoidWarning(dataVoid)
    || sampling === 'degraded') {
    return { globalOperatorShowsScore: true, instrumentDefault: null };
  }

  return { globalOperatorShowsScore: true, instrumentDefault: null };
}

function sufficiencyOf(comp) {
  const s = comp?.evidence_basis?.sufficiency;
  if (s) return s;
  // Legacy components (stored reports) — approximate from confidence/counts.
  if (comp?.confidence === 'insufficient_data' || (comp?.signal_count ?? 0) === 0) return 'none';
  if ((comp?.signal_count ?? 0) <= 2) return 'thin';
  return 'moderate';
}

/**
 * @param {object} comp — evidence component (or legacy stored component)
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

  const sufficiency = sufficiencyOf(comp);
  const balance = comp?.evidence_basis?.balance ?? null;

  if (comp?.epistemic_abstention === true || sufficiency === 'none') {
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

  if (sufficiency === 'thin') {
    return {
      instrument: THIN_EVIDENCE_INSTRUMENT.limited_evidence_neutral,
      operatorShowsScore: false,
      contested_thin: balance === 'contested',
    };
  }

  if (balance === 'contested' && sufficiency !== 'adequate') {
    return { instrument: THIN_EVIDENCE_INSTRUMENT.limited_evidence_neutral, operatorShowsScore: false, contested_thin: true };
  }

  return { instrument: THIN_EVIDENCE_INSTRUMENT.adequate, operatorShowsScore: true, contested_thin: false };
}

export function isThinEvidencePolicyEnabled() {
  return process.env.RESILIENCE_THIN_EVIDENCE_POLICY !== '0';
}
