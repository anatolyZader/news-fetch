/**
 * Execute a confirmed pending chat action.
 */
import { canViewAnalystDisplay } from '../../../cross-cut-modules/auth/userAccess.js';
import { PROPOSE_TOOL_NAMES, OPERATOR_PROPOSE_TOOL_NAMES } from '../domain/chatConfig.js';
import { updateOperatorRecommendationStatus, normalizeReportScope } from '../../resilience/index.js';
import { getTodayInTimezone } from '../../../utils/dateUtils.js';

const VALIDATION_ACTIONS = new Set([
  'label', 'skip', 'defer', 'gold_signal', 'confirm_social_quarantine', 'dismiss_social_quarantine',
]);
const GEO_STATUSES = new Set(['resolved', 'ignored', 'deferred']);
const CATALOG_STATUSES = new Set(['approved', 'rejected']);

async function executeValidationDecision(params, ctx) {
  const action = String(params.action ?? '');
  if (!VALIDATION_ACTIONS.has(action)) {
    throw new Error(`Invalid validation action: ${action}`);
  }
  const svc = ctx.validationReviewService;
  if (!svc) throw new Error('Validation review service unavailable');
  const scope = params.scope ?? 'national';
  svc.submitDecision(
    params.date,
    scope,
    params.article_key,
    { email: ctx.userEmail },
    { action, payload: { note: params.note ?? '' } },
  );
  return { ok: true, message: `Validation decision "${action}" applied for ${params.article_key}.` };
}

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

async function executeCatalogProposalReview(params, ctx) {
  const status = String(params.status ?? '');
  if (!CATALOG_STATUSES.has(status)) {
    throw new Error(`Invalid catalog proposal status: ${status}`);
  }
  const svc = ctx.catalogProposalService;
  if (!svc?.reviewProposal) throw new Error('Catalog proposal service unavailable');
  await svc.reviewProposal(params.proposal_id, {
    status,
    note: params.note ?? '',
    reviewer: ctx.userEmail,
  });
  return { ok: true, message: `Catalog proposal ${params.proposal_id} marked ${status}.` };
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
  propose_validation_decision: executeValidationDecision,
  propose_geo_unknown_update: executeGeoUnknownUpdate,
  propose_catalog_proposal_review: executeCatalogProposalReview,
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
