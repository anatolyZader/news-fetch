/**
 * Build chat tool execution context from injected services.
 */
import { canViewAnalystDisplay } from '../../../cross-cut-modules/auth/userAccess.js';
import { chatAnalystToolsEnabled, chatConfirmActionsEnabled } from '../domain/chatConfig.js';
import { buildChatToolList } from '../domain/tools/chatToolSchemas.js';

/**
 * @param {object} deps
 * @param {string} [deps.userEmail]
 * @param {object} [deps.reportData]
 * @param {object} [deps.pboLookup]
 * @param {object} [deps.sourceArchive]
 * @param {object} [deps.evidenceStore]
 * @param {object} [deps.retrievalService]
 * @param {object} [deps.validationReviewService]
 * @param {object} [deps.pboHistoricalSearchService]
 * @param {object} [deps.pboReportReviewService]
 * @param {object} [deps.driftService]
 * @param {() => object} [deps.getMunicipalityDashboard]
 * @param {object} [deps.catalogProposalService]
 * @param {object} [deps.geoUnknownReviewService]
 * @param {object} [deps.pendingActionStore]
 * @param {string} [deps.ownerUid]
 * @param {string} [deps.sessionId]
 * @param {function} [deps.onActionProposed]
 * @param {object} [deps.costRecorder]
 * @param {object} [deps.retrievalCache]
 */
export function createChatToolContext(deps = {}) {
  const userEmail = deps.userEmail ?? '';
  const isAnalyst = canViewAnalystDisplay(userEmail);
  const analystToolsEnabled = chatAnalystToolsEnabled();
  const confirmActionsEnabled = chatConfirmActionsEnabled();

  return {
    userEmail,
    isAnalyst,
    analystToolsEnabled,
    confirmActionsEnabled,
    reportData: deps.reportData ?? null,
    pboLookup: deps.pboLookup ?? {},
    sourceArchive: deps.sourceArchive ?? null,
    evidenceStore: deps.evidenceStore ?? null,
    retrievalService: deps.retrievalService ?? null,
    retrievalCache: deps.retrievalCache ?? null,
    costRecorder: deps.costRecorder ?? null,
    validationReviewService: deps.validationReviewService ?? null,
    pboHistoricalSearchService: deps.pboHistoricalSearchService ?? null,
    pboReportReviewService: deps.pboReportReviewService ?? null,
    driftService: deps.driftService ?? null,
    getMunicipalityDashboard: deps.getMunicipalityDashboard ?? null,
    catalogProposalService: deps.catalogProposalService ?? null,
    geoUnknownReviewService: deps.geoUnknownReviewService ?? null,
    pendingActionStore: deps.pendingActionStore ?? null,
    ownerUid: deps.ownerUid ?? '',
    sessionId: deps.sessionId ?? '',
    onActionProposed: deps.onActionProposed ?? null,
    economyOverride: deps.economyOverride ?? 'default',
    uiLang: deps.uiLang ?? 'en',
    tools: buildChatToolList({
      analystToolsEnabled,
      isAnalyst,
      confirmActionsEnabled,
      toolProfile: deps.toolProfile ?? 'default',
    }),
    toolProfile: deps.toolProfile ?? 'default',
  };
}

export function requireAnalyst(ctx, toolName) {
  if (!ctx.isAnalyst) {
    return `Tool "${toolName}" requires analyst access.`;
  }
  if (!ctx.analystToolsEnabled) {
    return `Analyst chat tools are disabled (CHAT_ANALYST_TOOLS_ENABLED=0).`;
  }
  return null;
}
