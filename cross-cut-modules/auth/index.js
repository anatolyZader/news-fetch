export { ACCESS_LEVELS, normalizeUserEmail, listConfiguredUsers, resolveUserAccessLevel, canViewAnalystDisplay, canRunAnalysisDisplay, hasPrivilegedUserAccessConfigured, userAccessForApi, resetUserAccessCache, setUserAccessConfigForTests } from './userAccess.js';
export { initFirebaseAdminForAuth, verifyIdTokenFromAuthorizationHeader, isEmailVerificationSatisfied } from './firebaseAdmin.js';
export { requireAuthPreHandler } from './requireAuthPreHandler.js';
export { tryAuthPreHandler } from './tryAuthPreHandler.js';
export { requireAnalystView } from './requireAnalystAccess.js';
export { requireMaintainerAccess, canRunAnalysisDisplay as canRunMaintainerAnalysis } from './maintainerAccess.js';
export { authRoutes } from './authRoutes.js';
export {
  isAuthRequireListedUser,
  isSignupDisabled,
  isOperatorDistrictEnforcementForced,
  shouldCheckRevokedTokens,
} from './authPolicy.js';
export { buildRequestUserFromDecoded, attachRequestUser } from './attachRequestUser.js';
export {
  buildAuthHook,
  buildReadAuthHook,
  buildJwtAuthHook,
  buildTryAuthHook,
  getAuthPreHandler,
  authPreHandlerList,
} from './buildAuthHooks.js';
export { syncAllUserAccessClaims, syncUserAccessClaimsForEmail, claimsForConfiguredUser } from './userAccessClaims.js';
export {
  resolveOperatorDistrictAccess,
  canOperatorAccessDistrict,
  requireOperatorDistrictAccess,
  operatorDistrictAccessForApi,
  isOperatorDistrictEnforcementEnabled,
  resetOperatorDistrictAccessCache,
  setOperatorDistrictAccessConfigForTests,
} from './operatorDistrictAccess.js';
export { checkOptionalDistrictQueryAccess } from './checkOptionalDistrictQueryAccess.js';
