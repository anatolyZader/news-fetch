/**
 * Build chat tool execution context from injected services.
 */
import { canUseRichChatTools } from '../../../cross-cut-modules/auth/userAccess.js';
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
 * @param {object} [deps.pboHistoricalSearchService]
 * @param {object} [deps.pboReportReviewService]
 * @param {() => object} [deps.getMunicipalityDashboard]
 * @param {object} [deps.geoUnknownReviewService]
 * @param {object} [deps.pendingActionStore]
 * @param {string} [deps.ownerUid]
 * @param {string} [deps.sessionId]
 * @param {function} [deps.onActionProposed]
 * @param {function} [deps.onCitation]
 * @param {object} [deps.costRecorder]
 * @param {object} [deps.retrievalCache]
 */
export function createChatToolContext(deps = {}) {
  const userEmail = deps.userEmail ?? '';
  const richTools = canUseRichChatTools(userEmail);
  const analystToolsEnabled = chatAnalystToolsEnabled();
  const confirmActionsEnabled = chatConfirmActionsEnabled();

  return {
    userEmail,
    richTools,
    analystToolsEnabled,
    confirmActionsEnabled,
    reportData: deps.reportData ?? null,
    redactReportPayload: deps.redactReportPayload ?? null,
    pboLookup: deps.pboLookup ?? {},
    sourceArchive: deps.sourceArchive ?? null,
    evidenceStore: deps.evidenceStore ?? null,
    retrievalService: deps.retrievalService ?? null,
    retrievalCache: deps.retrievalCache ?? null,
    costRecorder: deps.costRecorder ?? null,
    pboHistoricalSearchService: deps.pboHistoricalSearchService ?? null,
    pboReportReviewService: deps.pboReportReviewService ?? null,
    getMunicipalityDashboard: deps.getMunicipalityDashboard ?? null,
    geoUnknownReviewService: deps.geoUnknownReviewService ?? null,
    pendingActionStore: deps.pendingActionStore ?? null,
    ownerUid: deps.ownerUid ?? '',
    sessionId: deps.sessionId ?? '',
    onActionProposed: deps.onActionProposed ?? null,
    onCitation: deps.onCitation ?? null,
    economyOverride: deps.economyOverride ?? 'default',
    uiLang: deps.uiLang ?? 'en',
    resolvedModel: deps.resolvedModel ?? null,
    tools: buildChatToolList({
      analystToolsEnabled,
      richTools,
      confirmActionsEnabled,
      toolProfile: deps.toolProfile ?? 'default',
    }),
    toolProfile: deps.toolProfile ?? 'default',
  };
}

export function requireRichTools(ctx, toolName) {
  if (!ctx.richTools) {
    return `Tool "${toolName}" requires a listed account.`;
  }
  if (!ctx.analystToolsEnabled) {
    return `Extended chat tools are disabled (CHAT_ANALYST_TOOLS_ENABLED=0).`;
  }
  return null;
}

/** @deprecated use {@link requireRichTools} — kept as alias. */
export const requireAnalyst = requireRichTools;
