/**
 * Analyst HITL routes for crisis chat budget pool.
 */
import { canViewAnalystDisplay } from '../../auth/userAccess.js';
import { auditFromRequest } from '../../security/input/auditLog.js';

function requireAnalyst(request, reply) {
  if (canViewAnalystDisplay(request.user?.email)) return true;
  reply.code(403).send({ error: 'Analyst access required' });
  return false;
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ authHook: object, crisisBudgetService: object|null }} opts
 */
export async function registerCrisisBudgetRoutes(app, opts) {
  const { authHook, crisisBudgetService } = opts;
  if (!crisisBudgetService) return;

  app.get('/api/budget/crisis-status', authHook, async (request, reply) => {
    const assessment = request.query?.assessment_hint === '1'
      ? { data_void: { level: request.query?.void_level ?? 'none' }, epistemic_status: { sampling_status: request.query?.sampling ?? 'normal' } }
      : null;
    const chatStatus = crisisBudgetService.getChatBudgetStatus();
    return reply.send({
      ...chatStatus,
      enabled: true,
      suggest_crisis_budget: assessment
        ? crisisBudgetService.shouldSuggestCrisisBudget(assessment)
        : chatStatus.daily_exceeded && !chatStatus.crisis_active,
    });
  });

  app.post('/api/budget/crisis/activate', authHook, async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    const { reason, duration_hours: durationHours } = request.body ?? {};
    if (!reason || !String(reason).trim()) {
      return reply.code(400).send({ error: 'reason required' });
    }
    auditFromRequest(request, 'budget.crisis_activate', '/api/budget/crisis/activate', { reason });
    try {
      const session = crisisBudgetService.activate({
        activatedBy: request.user?.email ?? '',
        reason: String(reason).trim(),
        durationHours: durationHours == null ? undefined : Number(durationHours),
      });
      return reply.send({ ok: true, session, status: crisisBudgetService.getChatBudgetStatus() });
    } catch (err) {
      return reply.code(503).send({ error: err.message });
    }
  });

  app.post('/api/budget/crisis/deactivate', authHook, async (request, reply) => {
    if (!requireAnalyst(request, reply)) return;
    auditFromRequest(request, 'budget.crisis_deactivate', '/api/budget/crisis/deactivate');
    crisisBudgetService.deactivate();
    return reply.send({ ok: true, status: crisisBudgetService.getChatBudgetStatus() });
  });
}
