const DEFAULT_POLICY_URL = 'https://github.com/anatolyZader/news-fetch/security/policy';

/**
 * @param {string} email
 * @returns {boolean}
 */
function isValidContactEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? '').trim());
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function buildSecurityTxt(env = process.env) {
  const email = (env.SECURITY_CONTACT_EMAIL ?? '').trim();
  const policyUrl = (env.SECURITY_POLICY_URL ?? '').trim() || DEFAULT_POLICY_URL;
  const expiresRaw = (env.SECURITY_TXT_EXPIRES ?? '').trim();
  const expires = expiresRaw || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  return [
    `Contact: mailto:${email}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en, he',
    `Policy: ${policyUrl}`,
    '',
  ].join('\n');
}

export { isValidContactEmail, DEFAULT_POLICY_URL };
