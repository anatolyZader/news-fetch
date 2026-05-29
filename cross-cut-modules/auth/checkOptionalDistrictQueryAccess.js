import { requireOperatorDistrictAccess } from './operatorDistrictAccess.js';

/**
 * When a regional district query param is present, enforce operator registration.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {boolean}
 */
export function checkOptionalDistrictQueryAccess(request, reply) {
  const district = String(request.query?.district ?? 'national').trim().toLowerCase();
  if (!district || district === 'national') return true;
  return requireOperatorDistrictAccess(request, reply, district);
}
