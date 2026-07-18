/**
 * Execute a confirmed pending chat action.
 */
import { canViewAnalystDisplay } from '../../../cross-cut-modules/auth/userAccess.js';
import { PROPOSE_TOOL_NAMES, OPERATOR_PROPOSE_TOOL_NAMES } from '../domain/chatConfig.js';
import { normalizeReportScope } from '../../resilience_scorer/index.js';
import { updateOperatorRecommendationStatus } from '../../resilience_scorer/index.js';
import { getTodayInTimezone } from '../../../utils/dateUtils.js';

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
  const result = updateOperatorRecommendationStatus(
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

const PENDING_EXECUTORS = {
  propose_geo_unknown_update: executeGeoUnknownUpdate,
  propose_operator_recommendation: executeOperatorRecommendation,
};

/**
 * @param {object} pending from chatPendingActionStore
 * @param {object} ctx services + userEmail
 */
export async function executePendingAction(pending, ctx) {
  const isOperatorTool = OPERATOR_PROPOSE_TOOL_NAMES.has(pending.toolName);
  if (!isOperatorTool && !canViewAnalystDisplay(ctx.userEmail)) {
    throw new Error('Analyst access required');
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
