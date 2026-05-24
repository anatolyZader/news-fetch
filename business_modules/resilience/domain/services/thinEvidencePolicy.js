/**
 * Option C — hybrid thin-evidence operator policy.
 * @see docs/MODEL-CARD.md
 */

export const THIN_EVIDENCE_INSTRUMENT = Object.freeze({
  insufficient_data: 'insufficient_data',
  limited_evidence_neutral: 'limited_evidence_neutral',
  unverified_alert: 'unverified_alert',
  adequate: 'adequate',
});

const MIN_MASS = 1.5;

/**
 * @param {object} comp — scored component (pre-operator redaction)
 * @returns {{ instrument: string, operatorShowsScore: boolean, contested_thin: boolean }}
 */
export function deriveThinEvidencePolicy(comp) {
  const mass = Number(comp?.evidence_mass ?? 0);
  const confidence = comp?.confidence ?? 'insufficient_data';

  if (confidence === 'insufficient_data' || comp?.score == null) {
    return { instrument: THIN_EVIDENCE_INSTRUMENT.insufficient_data, operatorShowsScore: false, contested_thin: false };
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
