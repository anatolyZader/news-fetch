/**
 * Shared Resend delivery gate. Consumers span two business modules (mailing,
 * pbo_report_review) plus the composition root, so this lives cross-cut.
 */
import { envFlagOff } from './envFlags.js';

/**
 * Resend delivery is usable: not explicitly disabled, and key + from are set.
 * MAILING_ENABLED accepts '0' | 'false' | 'off' as the kill switch.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isMailingConfigured(env = process.env) {
  if (envFlagOff(env, 'MAILING_ENABLED')) return false;
  return Boolean(env.RESEND_API_KEY?.trim() && env.MAIL_FROM?.trim());
}
