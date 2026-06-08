import { isValidContactEmail } from './buildSecurityTxt.js';

function collectProductionSecurityErrors(env) {
  const errors = [];
  const checks = [
    () => env.AUTH_REQUIRED !== 'true' && 'AUTH_REQUIRED must be "true" when NODE_ENV=production',
    () => env.AUTH_REQUIRE_LISTED_USER === 'false' && 'AUTH_REQUIRE_LISTED_USER must not be "false" in production',
    () => !(env.FIREBASE_PROJECT_ID ?? '').trim() && 'FIREBASE_PROJECT_ID is required when NODE_ENV=production',
    () => env.ALLOW_INSECURE_PUBLIC_API === 'true' && 'ALLOW_INSECURE_PUBLIC_API must not be "true" in production',
    () => env.APP_CHECK_ENFORCE !== 'true' && 'APP_CHECK_ENFORCE must be "true" when NODE_ENV=production',
    () => env.TRUST_PROXY !== 'true' && 'TRUST_PROXY must be "true" when NODE_ENV=production',
    () => env.ENABLE_HSTS !== 'true' && 'ENABLE_HSTS must be "true" when NODE_ENV=production',
    () => env.ENABLE_STRICT_CSP !== 'true' && 'ENABLE_STRICT_CSP must be "true" when NODE_ENV=production',
    () => env.AUTH_DISABLE_SIGNUP === 'false' && 'AUTH_DISABLE_SIGNUP must not be "false" in production (open registration)',
    () => env.ENABLE_SWAGGER === 'true' && 'ENABLE_SWAGGER must not be "true" in production',
  ];
  for (const check of checks) {
    const message = check();
    if (message) errors.push(message);
  }
  return errors;
}

function validateContactEmail(env, errors) {
  const contactEmail = (env.SECURITY_CONTACT_EMAIL ?? '').trim();
  if (!contactEmail) {
    errors.push('SECURITY_CONTACT_EMAIL is required when NODE_ENV=production');
  } else if (!isValidContactEmail(contactEmail)) {
    errors.push('SECURITY_CONTACT_EMAIL must be a valid email address');
  }
}

function validateWhatsappSecret(env, errors) {
  const whatsappEnabled = !!(env.WHATSAPP_VERIFY_TOKEN ?? '').trim();
  if (whatsappEnabled && !(env.WHATSAPP_APP_SECRET ?? '').trim()) {
    errors.push('WHATSAPP_APP_SECRET is required when WHATSAPP_VERIFY_TOKEN is set in production');
  }
}

function validateProbeHmac(env, errors) {
  const probeRequire =
    env.RESILIENCE_PROBE_REQUIRE_HMAC === 'true' || (env.NODE_ENV ?? '').trim() === 'production';
  if (probeRequire && !(env.RESILIENCE_PROBE_HMAC_SECRET ?? '').trim()) {
    errors.push(
      'RESILIENCE_PROBE_HMAC_SECRET is required in production (or set RESILIENCE_PROBE_REQUIRE_HMAC=false if probes unused)',
    );
  }
}

/**
 * Fail fast when production env is misconfigured for security.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function validateProductionSecurity(env = process.env) {
  const nodeEnv = (env.NODE_ENV ?? '').trim();
  if (nodeEnv !== 'production') {
    return;
  }

  const errors = collectProductionSecurityErrors(env);
  validateContactEmail(env, errors);
  validateWhatsappSecret(env, errors);
  validateProbeHmac(env, errors);

  if (errors.length > 0) {
    throw new Error(`Production security validation failed:\n- ${errors.join('\n- ')}`);
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function productionSecurityWarnings(env = process.env) {
  const warnings = [];
  if ((env.NODE_ENV ?? '').trim() === 'production' && env.SYNC_USER_CLAIMS_ON_START !== 'true') {
    warnings.push(
      'SYNC_USER_CLAIMS_ON_START is not "true" — Firebase custom claims may be stale until POST /api/auth/sync-claims',
    );
  }
  return warnings;
}
