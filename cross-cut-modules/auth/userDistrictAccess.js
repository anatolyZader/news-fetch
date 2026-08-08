import {
  ISRAEL_REGIONAL_DISTRICT_ORDER,
  normalizeIsraelDistrictId,
} from '../geo/israelDistricts.js';
import {
  isUserDistrictEnforcementEnabled,
  userDistrictEntriesFromUserAccess,
  resetUserAccessCache,
  setUserAccessConfigForTests,
  resolveUserAccessLevel,
  ACCESS_LEVELS,
} from './userAccess.js';

/** Reset cached config (tests). */
export function resetUserDistrictAccessCache() {
  resetUserAccessCache();
}

/** @param {object | null} cfg */
export function setUserDistrictAccessConfigForTests(cfg) {
  setUserAccessConfigForTests(cfg);
}



/**
 * @param {string | null | undefined} email
 * @returns {{
 *   enforcementEnabled: boolean,
 *   unrestricted: boolean,
 *   districtIds: string[],
 *   allowedReportScopes: string[],
 * }}
 */
export function resolveUserDistrictAccess(email) {
  const allRegional = [...ISRAEL_REGIONAL_DISTRICT_ORDER];
  const allReportScopes = ['national', ...allRegional];

  if (!isUserDistrictEnforcementEnabled()) {
    return {
      enforcementEnabled: false,
      unrestricted: true,
      districtIds: allRegional,
      allowedReportScopes: allReportScopes,
    };
  }

  const normalized = String(email ?? '').trim().toLowerCase();
  const level = resolveUserAccessLevel(normalized);
  if (level === ACCESS_LEVELS.developer || level === ACCESS_LEVELS.maintainer) {
    return {
      enforcementEnabled: true,
      unrestricted: true,
      districtIds: allRegional,
      allowedReportScopes: allReportScopes,
    };
  }

  if (!normalized) {
    return {
      enforcementEnabled: true,
      unrestricted: false,
      districtIds: [],
      allowedReportScopes: ['national'],
    };
  }

  const entry = userDistrictEntriesFromUserAccess()[normalized];
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
export function canUserAccessDistrict(email, districtId) {
  const id = normalizeIsraelDistrictId(districtId);
  if (id === 'national') return true;
  const access = resolveUserDistrictAccess(email);
  if (!access.enforcementEnabled || access.unrestricted) return true;
  return access.districtIds.includes(id);
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {string} districtId
 * @returns {boolean}
 */
export function requireUserDistrictAccess(request, reply, districtId) {
  if (canUserAccessDistrict(request.user?.email, districtId)) return true;
  reply.code(403).send({
    error: 'Forbidden',
    code: 'district_access_denied',
    districtId: normalizeIsraelDistrictId(districtId),
    message: `User is not registered for district "${normalizeIsraelDistrictId(districtId)}"`,
  });
  return false;
}

/**
 * @param {string | null | undefined} email
 * @returns {object}
 */
export function userDistrictAccessForApi(email) {
  const access = resolveUserDistrictAccess(email);
  return {
    enforcementEnabled: access.enforcementEnabled,
    unrestricted: access.unrestricted,
    districtIds: access.districtIds,
    allowedReportScopes: access.allowedReportScopes,
  };
}

export {isUserDistrictEnforcementEnabled} from './userAccess.js';