/**
 * Backward-compatible re-export barrel for data-void / digital-darkness services.
 *
 * Pipeline position: consumed by `evidencePipelinePrep` and assessment finalize;
 * call sites import from here rather than `dataVoid/` subpaths for stability.
 *
 * Owns: public facade of computeDataVoidIndex, source channel helpers, epistemic
 * gate, scoring partition, and epistemic status builders.
 * Does NOT: implement void logic (see `dataVoid/computeDataVoidIndex.js`) or score
 * components — count-based evidence only downstream.
 *
 * Key collaborators: `dataVoid/computeDataVoidIndex.js`, `dataVoid/epistemicGate.js`,
 * `dataVoid/scoringPartition.js`, `app/assessment/evidencePipelinePrep.js`.
 */

export {
  computeDataVoidIndex,
  isDataVoidEnabled,
} from './dataVoid/computeDataVoidIndex.js';

export {
  DIGITAL_SOURCE_TYPES,
  FIELD_SOURCE_TYPES,
  PROBE_SOURCE_TYPES,
  filterFieldAnchorSignals,
  isDigitalSignal,
  isFieldSignal,
  isProbeSignal,
} from './dataVoid/sourceChannels.js';

export { applyEpistemicGate, attachEpistemicToAssessment, applyScoreAbstention } from './dataVoid/epistemicGate.js';
export { buildEpistemicStatus } from './dataVoid/epistemicStatus.js';
export {
  resolveScoringPartition,
  summarizeQuarantinedSignals,
  isScoringPartitionEnabled,
  QUARANTINE_REASON,
} from './dataVoid/scoringPartition.js';
