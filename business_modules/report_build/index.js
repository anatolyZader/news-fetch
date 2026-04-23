export { createReportBuildService } from './app/reportBuildService.js';

export { computeGaps, isSufficient, mergeStructured } from './domain/gapEngine.js';
export {
  EVIDENCE_REQUIREMENTS,
  COMPONENT_IDS,
  UNIVERSAL_REQUIRED,
  SPREAD_VALUES,
  SOURCE_BASIS_VALUES,
  DIRECTION_VALUES,
  COMPARISON_VALUES,
  CONFIDENCE_LEVELS,
} from './domain/evidenceRequirements.js';

export { createAnthropicReportBuildAnalyzerAdapter } from './infrastructure/adapters/anthropicReportBuildAnalyzerAdapter.js';
export { createAnthropicReportBuildDraftGeneratorAdapter } from './infrastructure/adapters/anthropicReportBuildDraftGeneratorAdapter.js';
export { createReportBuildConversationStore } from './infrastructure/reportBuildConversationStore.js';
export { createReportBuildDraftStore } from './infrastructure/reportBuildDraftStore.js';

