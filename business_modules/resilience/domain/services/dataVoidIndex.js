/**
 * Data void / digital darkness index — backward-compatible re-export.
 * @see dataVoid/computeDataVoidIndex.js
 */

export {
  computeDataVoidIndex,
  isDataVoidEnabled,
} from './dataVoid/computeDataVoidIndex.js';

export {
  DIGITAL_SOURCE_TYPES,
  FIELD_SOURCE_TYPES,
  PROBE_SOURCE_TYPES,
  CAP_EXEMPT_SOURCE_TYPES,
  filterFieldAnchorSignals,
  isDigitalSignal,
  isFieldSignal,
  isProbeSignal,
} from './dataVoid/sourceChannels.js';

export { applyEpistemicGate, attachEpistemicToAssessment, applyScoreAbstention } from './dataVoid/epistemicGate.js';
export { buildEpistemicStatus } from './dataVoid/epistemicStatus.js';
