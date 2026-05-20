/**
 * Who may trigger the full resilience analysis pipeline from the web API.
 * Website users read cached reports only; maintainers run analysis.
 */

function parseMaintainerAllowlist() {
  const raw = process.env.RESILIENCE_MAINTAINER_EMAILS ?? '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export function canRunAnalysisDisplay(email) {
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!normalized) return false;
  const allowlist = parseMaintainerAllowlist();
  return allowlist.length > 0 && allowlist.includes(normalized);
}

/**
 * Fastify helper: 403 unless request user may run analysis.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {boolean} true if allowed
 */
export function requireMaintainerAccess(request, reply) {
  if (!canRunAnalysisDisplay(request.user?.email)) {
    reply.code(403).send({
      error: 'Forbidden',
      code: 'maintainer_required',
      message:
        'Running analysis requires a maintainer account (RESILIENCE_MAINTAINER_EMAILS + signed-in email).',
    });
    return false;
  }
  return true;
}
