/**
 * Investigation epistemic context — data-void driven hints for specialist agents.
 *
 * Pipeline position: assess — before agent investigation; derived from data void, not score gates.
 *
 * Owns: deriveInvestigationEpistemicContext (data void → epistemicStatus / investigationMode).
 * Does NOT: build per-component profiles or thin-evidence instruments (epistemicProfileBuilder.js, thinEvidencePolicy.js).
 *
 * Key collaborators: epistemicStatus.js, assessmentOrchestrator.js, evidencePipelinePrep.js.
 */

import { buildEpistemicStatus } from '../services/dataVoid/epistemicStatus.js';

/**
 * Derive assessment/investigation epistemic context from data void only.
 * Agents receive the full metrics pool; digital darkness is informational, not a hard gate.
 *
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
