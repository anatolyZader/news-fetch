import {
  ISRAEL_REGIONAL_DISTRICT_ORDER,
  normalizeIsraelDistrictId,
} from '../geo/israelDistricts.js';
import {
  isOperatorDistrictEnforcementEnabled,
  operatorDistrictEntriesFromUserAccess,
  resetUserAccessCache,
  setUserAccessConfigForTests,
} from './userAccess.js';

/** Reset cached config (tests). */
export function resetOperatorDistrictAccessCache() {
  resetUserAccessCache();
}

/** @param {object | null} cfg */
export function setOperatorDistrictAccessConfigForTests(cfg) {
  setUserAccessConfigForTests(cfg);
}

export { isOperatorDistrictEnforcementEnabled };

/**
 * @param {string | null | undefined} email
 * @returns {{
 *   enforcementEnabled: boolean,
 *   unrestricted: boolean,
 *   districtIds: string[],
 *   allowedReportScopes: string[],
 * }}
 */
export function resolveOperatorDistrictAccess(email) {
  const allRegional = [...ISRAEL_REGIONAL_DISTRICT_ORDER];
  const allReportScopes = ['national', ...allRegional];

  if (!isOperatorDistrictEnforcementEnabled()) {
    return {
      enforcementEnabled: false,
      unrestricted: true,
      districtIds: allRegional,
      allowedReportScopes: allReportScopes,
    };
  }

  const normalized = String(email ?? '').trim().toLowerCase();
  if (!normalized) {
    return {
      enforcementEnabled: true,
      unrestricted: false,
      districtIds: [],
      allowedReportScopes: ['national'],
    };
  }

  const entry = operatorDistrictEntriesFromUserAccess()[normalized];
  if (!entry) {
    return {
      enforcementEnabled: true,
      unrestricted: false,
      districtIds: [],
      allowedReportScopes: ['national'],
    };
  }

  if (entry.allDistricts === true) {
    return {
      enforcementEnabled: true,
      unrestricted: true,
      districtIds: allRegional,
      allowedReportScopes: allReportScopes,
    };
  }

  const districtIds = [...new Set(
    (entry.districtIds ?? [])
      .map((id) => normalizeIsraelDistrictId(id))
      .filter((id) => allRegional.includes(id)),
  )];

  return {
    enforcementEnabled: true,
    unrestricted: false,
    districtIds,
    allowedReportScopes: ['national', ...districtIds],
  };
}

/**
 * @param {string | null | undefined} email
 * @param {string} [districtId]
 * @returns {boolean}
 */
export function canOperatorAccessDistrict(email, districtId) {
  const id = normalizeIsraelDistrictId(districtId);
  if (id === 'national') return true;
  const access = resolveOperatorDistrictAccess(email);
  if (!access.enforcementEnabled || access.unrestricted) return true;
  return access.districtIds.includes(id);
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {string} districtId
 * @returns {boolean}
 */
export function requireOperatorDistrictAccess(request, reply, districtId) {
  if (canOperatorAccessDistrict(request.user?.email, districtId)) return true;
  reply.code(403).send({
    error: 'Forbidden',
    code: 'district_access_denied',
    districtId: normalizeIsraelDistrictId(districtId),
    message: `Operator is not registered for district "${normalizeIsraelDistrictId(districtId)}"`,
  });
  return false;
}

/**
 * @param {string | null | undefined} email
 * @returns {object}
 */
export function operatorDistrictAccessForApi(email) {
  const access = resolveOperatorDistrictAccess(email);
  return {
    enforcementEnabled: access.enforcementEnabled,
    unrestricted: access.unrestricted,
    districtIds: access.districtIds,
    allowedReportScopes: access.allowedReportScopes,
  };
}
