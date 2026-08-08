import { requireUserDistrictAccess } from './userDistrictAccess.js';

/**
 * When a regional district query param is present, enforce user registration.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @returns {boolean}
 */
export function checkOptionalDistrictQueryAccess(request, reply) {
  const district = String(request.query?.district ?? 'national').trim().toLowerCase();
  if (!district || district === 'national') return true;
  return requireUserDistrictAccess(request, reply, district);
}
