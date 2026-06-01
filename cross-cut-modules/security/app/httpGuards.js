/**
 * Reusable Fastify route guards — centralizes request-handling boilerplate that
 * was duplicated across module routes (service-availability 503s and the
 * YYYY-MM-DD date-param 400). Each guard writes the reply and returns a
 * sentinel so handlers stay thin:
 *
 *   if (!assertService(svc, reply, 'foo service not configured')) return;
 *   const date = dateParam(request.query?.date, reply); if (date === null) return;
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 503 unless the service (or required capability) is present.
 * @param {*} service the service instance, or a method reference to probe
 * @param {import('fastify').FastifyReply} reply
 * @param {string} [message]
 * @returns {boolean} true if available
 */
export function assertService(service, reply, message = 'service not configured') {
  if (!service) {
    reply.code(503).send({ error: message });
    return false;
  }
  return true;
}

/**
 * Validate a YYYY-MM-DD request param. Sends 400 and returns null when invalid.
 * @param {*} value raw query/param value
 * @param {import('fastify').FastifyReply} reply
 * @param {{ field?: string }} [opts]
 * @returns {string|null} the trimmed date, or null when invalid (reply already sent)
 */
export function dateParam(value, reply, { field = 'date' } = {}) {
  const date = String(value ?? '').trim();
  if (!DATE_RE.test(date)) {
    reply.code(400).send({ error: `${field} query param required (YYYY-MM-DD)` });
    return null;
  }
  return date;
}

/** True if a string is a well-formed YYYY-MM-DD date (no reply side effect). */
export function isIsoDate(value) {
  return DATE_RE.test(String(value ?? '').trim());
}
