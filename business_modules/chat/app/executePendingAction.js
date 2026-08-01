/**
 * Execute a confirmed pending chat action.
 */
import { canUseRichChatTools } from '../../../cross-cut-modules/auth/userAccess.js';
import {
  PROPOSE_TOOL_NAMES,
  OPERATOR_PROPOSE_TOOL_NAMES,
  SIGNAL_FLAG_REASONS,
} from '../domain/chatConfig.js';
import { normalizeReportScope } from '../../resilience_scorer/index.js';
import { updateOperatorRecommendationStatus } from '../../resilience_scorer/index.js';
import { getTodayInTimezone } from '../../../utils/dateUtils.js';
import { getSignalById } from '../domain/signalLookup.js';

const GEO_STATUSES = new Set(['resolved', 'ignored', 'deferred']);

async function executeGeoUnknownUpdate(params, ctx) {
  const status = String(params.status ?? '');
  if (!GEO_STATUSES.has(status)) {
    throw new Error(`Invalid geo status: ${status}`);
  }
  const svc = ctx.geoUnknownReviewService;
  if (!svc?.updateStatus) throw new Error('Geo unknown review service unavailable');
  svc.updateStatus(params.id, { status, reviewerNote: params.note ?? '', reviewer: ctx.userEmail });
  return { ok: true, message: `Geo unknown entry #${params.id} marked ${status}.` };
}

async function executeOperatorRecommendation(params, ctx) {
  const action = String(params.action ?? '');
  if (action !== 'acknowledge' && action !== 'dismiss') {
    throw new Error(`Invalid operator recommendation action: ${action}`);
  }
  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const reportDate = String(params.date ?? '').trim() || getTodayInTimezone(timezone);
  const scope = normalizeReportScope(params.scope ?? 'national');
  const result = await updateOperatorRecommendationStatus(
    reportDate,
    scope,
    params.recommendation_id,
    { action, userEmail: ctx.userEmail, rationale: params.rationale ?? params.note ?? '' },
  );
  if (!result.ok) {
    throw new Error(result.error ?? 'Failed to update recommendation');
  }
  return {
    ok: true,
    message: `Operator recommendation "${params.recommendation_id}" marked ${action}.`,
    recommendation: result.recommendation,
  };
}

async function executeSignalFlag(params, ctx) {
  const reason = String(params.reason ?? '');
  if (!SIGNAL_FLAG_REASONS.has(reason)) {
    throw new Error(`Invalid flag reason: ${reason}`);
  }
  const store = ctx.signalFlagStore;
  if (!store?.append) throw new Error('Signal flag store unavailable');
  const signalId = String(params.signal_id ?? '').trim() || null;
  const located = signalId ? getSignalById(signalId).signal ?? null : null;
  const entry = store.append({
    user: ctx.userEmail ?? '',
    signal_id: signalId,
    source_ref: String(params.source_ref ?? '').trim() || null,
    signal_type: located?.signal_type ?? null,
    date: located?.date ?? null,
    source_type: located?.source_type ?? null,
    reason,
    note: String(params.note ?? ''),
    session_id: ctx.sessionId ?? null,
  });
  return {
    ok: true,
    message: `Signal flag recorded (${entry.flag_id}): ${signalId ?? params.source_ref} → ${reason}.`,
    flag_id: entry.flag_id,
  };
}

const PENDING_EXECUTORS = {
  propose_geo_unknown_update: executeGeoUnknownUpdate,
  propose_operator_recommendation: executeOperatorRecommendation,
  propose_signal_flag: executeSignalFlag,
};

/**
 * @param {object} pending from chatPendingActionStore
 * @param {object} ctx services + userEmail
 */
export async function executePendingAction(pending, ctx) {
  const isOperatorTool = OPERATOR_PROPOSE_TOOL_NAMES.has(pending.toolName);
  if (!isOperatorTool && !canUseRichChatTools(ctx.userEmail)) {
    throw new Error('Listed account required');
  }
  if (!PROPOSE_TOOL_NAMES.has(pending.toolName)) {
    throw new Error(`Unknown propose tool: ${pending.toolName}`);
  }

  const executor = PENDING_EXECUTORS[pending.toolName];
  if (!executor) {
    throw new Error(`Unhandled propose tool: ${pending.toolName}`);
  }
  return executor(pending.params, ctx);
}
