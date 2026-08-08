/**
 * Auth policy flags from environment (membership gate, signup, district enforcement).
 */

/**
 * When true, protected routes reject Firebase users not listed in userAccess.json / env overrides.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isAuthRequireListedUser(env = process.env) {
  const explicit = (env.AUTH_REQUIRE_LISTED_USER ?? '').trim().toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  if ((env.NODE_ENV ?? '').trim() === 'production') return true;
  return env.AUTH_REQUIRED === 'true';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isSignupDisabled(env = process.env) {
  const explicit = (env.AUTH_DISABLE_SIGNUP ?? '').trim().toLowerCase();
  if (explicit === 'false') return false;
  if (explicit === 'true') return true;
  return (env.NODE_ENV ?? '').trim() === 'production';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isUserDistrictEnforcementForced(env = process.env) {
  return (env.OPERATOR_DISTRICT_ENFORCEMENT_ENABLED ?? '').trim().toLowerCase() === 'true';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function shouldCheckRevokedTokens(env = process.env) {
  if ((env.FIREBASE_CHECK_REVOKED ?? '').trim().toLowerCase() === 'false') return false;
  if ((env.FIREBASE_CHECK_REVOKED ?? '').trim().toLowerCase() === 'true') return true;
  return (env.NODE_ENV ?? '').trim() === 'production';
}
