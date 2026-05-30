/**
 * Resolve listen host for production (localhost-only by default).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveListenHost(env = process.env) {
  const explicit = (env.HOST ?? '').trim();
  if (explicit) return explicit;
  if (env.NODE_ENV === 'production' && env.ALLOW_PUBLIC_BIND !== 'true') {
    return '127.0.0.1';
  }
  return '0.0.0.0';
}
