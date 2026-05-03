/**
 * Fastify routes for reviewer overrides on resilience reports (N3).
 *
 * v1: persist + retrieve only. No score recomputation. Each component card in the
 * UI displays "{n} reviewer notes" derived from the per-date count, building the
 * data flywheel for future score-adjustment passes.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   service: ReturnType<import('../app/overridesService.js').createOverridesService>,
 *   authPreHandler?: Function,
 * }} opts
 */
export async function registerOverridesRoutes(app, opts) {
  const service = opts?.service ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/resilience/overrides', preHandler, async (request, reply) => {
    if (!service) return reply.code(503).send({ error: 'overrides service not configured' });
    const date = request.query?.date;
    const scope = request.query?.scope === 'north' ? 'north' : 'national';
    if (!date) return reply.code(400).send({ error: 'date is required' });
    try {
      const overrides = service.list({ date, scope });
      return reply.send({ overrides, count: overrides.length });
    } catch (err) {
      if (err?.code === 'date_invalid') {
        return reply.code(400).send({ error: 'date must be YYYY-MM-DD' });
      }
      return reply.code(500).send({ error: 'failed to list overrides' });
    }
  });

  app.post('/api/resilience/overrides', preHandler, async (request, reply) => {
    if (!service) return reply.code(503).send({ error: 'overrides service not configured' });
    const body = request.body ?? {};
    const uid = request.user?.uid ?? body.uid ?? null;
    const email = request.user?.email ?? body.email ?? null;
    if (!uid) return reply.code(401).send({ error: 'authenticated user required' });
    try {
      const created = service.create({
        uid,
        email,
        report_date:  body.report_date,
        scope:        body.scope ?? 'national',
        component_id: body.component_id,
        kind:         body.kind,
        original:     body.original ?? null,
        proposed:     body.proposed ?? null,
        note:         body.note ?? null,
      });
      return reply.code(201).send({ override: created });
    } catch (err) {
      if (err?.code === 'validation_failed') {
        return reply.code(400).send({ error: 'validation_failed', details: err.details });
      }
      return reply.code(500).send({ error: 'failed to create override' });
    }
  });
}
