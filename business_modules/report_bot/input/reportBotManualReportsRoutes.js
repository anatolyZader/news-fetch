import { basename } from 'node:path';
import { checkOptionalDistrictQueryAccess } from '../../../cross-cut-modules/auth/checkOptionalDistrictQueryAccess.js';
import { maybeLocalize } from '../../translation/index.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ service: ReturnType<import('../app/reportBotManualReportsService.js').createReportBotManualReportsService>, authPreHandler?: any }} opts
 */
export async function reportBotManualReportsRoutes(app, opts) {
  const service = opts?.service ?? null;
  const preHandler = opts?.authPreHandler ? { preHandler: opts.authPreHandler } : {};

  app.get('/api/report-bot/manual-reports', preHandler, async (request, reply) => {
    if (!service) {
      return reply.code(503).send({ error: 'report bot manual reports service not configured' });
    }
    if (!checkOptionalDistrictQueryAccess(request, reply)) return;
    try {
      return reply.send(await maybeLocalize(service.getDashboard(), 'reportBot.list', request));
    } catch (err) {
      return reply.code(502).send({ error: err?.message ?? 'Failed to load report bot manual reports' });
    }
  });

  app.get('/api/report-bot/manual-reports/file', preHandler, async (request, reply) => {
    if (!service) {
      return reply.code(503).send({ error: 'report bot manual reports service not configured' });
    }
    if (!checkOptionalDistrictQueryAccess(request, reply)) return;
    const name = String(request.query?.name ?? '').trim();
    if (!name) {
      return reply.code(400).send({ error: 'name query parameter is required' });
    }
    try {
      const content = service.getFileText(name);
      return reply.send(await maybeLocalize(
        { fileName: basename(name), content },
        'reportBot.file',
        request,
        { fingerprintExtra: name },
      ));
    } catch (err) {
      const msg = err?.message ?? 'Not found';
      return reply.code(404).send({ error: msg });
    }
  });
}
