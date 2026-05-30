import { isValidContactEmail } from './buildSecurityTxt.js';

/**
 * Fail fast when production env is misconfigured for security.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function validateProductionSecurity(env = process.env) {
  const nodeEnv = (env.NODE_ENV ?? '').trim();
  if (nodeEnv !== 'production') {
    return;
  }

  const errors = [];

  if (env.AUTH_REQUIRED !== 'true') {
    errors.push('AUTH_REQUIRED must be "true" when NODE_ENV=production');
  }

  if (!(env.FIREBASE_PROJECT_ID ?? '').trim()) {
    errors.push('FIREBASE_PROJECT_ID is required when NODE_ENV=production');
  }

  if (env.ALLOW_INSECURE_PUBLIC_API === 'true') {
    errors.push('ALLOW_INSECURE_PUBLIC_API must not be "true" in production');
  }

  if (env.APP_CHECK_ENFORCE !== 'true') {
    errors.push('APP_CHECK_ENFORCE must be "true" when NODE_ENV=production');
  }

  if (env.TRUST_PROXY !== 'true') {
    errors.push('TRUST_PROXY must be "true" when NODE_ENV=production');
  }

  if (env.ENABLE_HSTS !== 'true') {
    errors.push('ENABLE_HSTS must be "true" when NODE_ENV=production');
  }

  if (env.ENABLE_SWAGGER === 'true') {
    errors.push('ENABLE_SWAGGER must not be "true" in production');
  }

  const contactEmail = (env.SECURITY_CONTACT_EMAIL ?? '').trim();
  if (!contactEmail) {
    errors.push('SECURITY_CONTACT_EMAIL is required when NODE_ENV=production');
  } else if (!isValidContactEmail(contactEmail)) {
    errors.push('SECURITY_CONTACT_EMAIL must be a valid email address');
  }

  const whatsappEnabled = !!(env.WHATSAPP_VERIFY_TOKEN ?? '').trim();
  if (whatsappEnabled && !(env.WHATSAPP_APP_SECRET ?? '').trim()) {
    errors.push('WHATSAPP_APP_SECRET is required when WHATSAPP_VERIFY_TOKEN is set in production');
  }

  const probeRequire =
    env.RESILIENCE_PROBE_REQUIRE_HMAC === 'true' || nodeEnv === 'production';
  if (probeRequire && !(env.RESILIENCE_PROBE_HMAC_SECRET ?? '').trim()) {
    errors.push(
      'RESILIENCE_PROBE_HMAC_SECRET is required in production (or set RESILIENCE_PROBE_REQUIRE_HMAC=false if probes unused)',
    );
  }

  if (errors.length > 0) {
    throw new Error(`Production security validation failed:\n- ${errors.join('\n- ')}`);
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function productionSecurityWarnings(_env = process.env) {
  return [];
}
