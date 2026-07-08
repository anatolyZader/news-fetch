/**
 * Investigation epistemic context — derived from data void only, not score gates.
 * Agent receives full metrics pool; digital darkness is informational for operators.
 */

import { buildEpistemicStatus } from '../services/dataVoid/epistemicStatus.js';

/**
 * @param {object|null|undefined} dataVoid
 * @returns {{ assessmentMode: string, epistemicStatus: object, investigationMode: string|null }}
 */
export function deriveInvestigationEpistemicContext(dataVoid) {
  const digitalDarkness = dataVoid?.digital_darkness === true;
  const investigationMode = digitalDarkness ? 'digital_darkness' : null;

  const epistemicStatus = buildEpistemicStatus(dataVoid, {
    assessmentMode: 'normal',
  });

  if (digitalDarkness && epistemicStatus.assessment_mode === 'normal') {
    epistemicStatus.investigation_mode = 'digital_darkness';
    epistemicStatus.investigation_note =
      'Full signal pool available for investigation; shadow scoring may quarantine digital signals.';
  }

  return {
    assessmentMode: 'normal',
    epistemicStatus,
    investigationMode,
  };
}
