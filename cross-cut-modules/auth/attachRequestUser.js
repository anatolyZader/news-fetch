import { resolveUserAccessLevel, normalizeUserEmail } from './userAccess.js';
import { isAuthRequireListedUser } from './authPolicy.js';

/**
 * Build `request.user` from a verified Firebase ID token.
 * @param {import('firebase-admin/auth').DecodedIdToken} decoded
 * @param {{ requireListed?: boolean }} [opts]
 * @returns {{ user?: object, error?: string }}
 */
export function buildRequestUserFromDecoded(decoded, opts = {}) {
  const email = normalizeUserEmail(decoded.email);
  const level = resolveUserAccessLevel(email);
  const requireListed = opts.requireListed ?? isAuthRequireListedUser();

  if (requireListed && !level) {
    return { error: 'forbidden_not_invited' };
  }

  return {
    user: {
      uid: decoded.uid,
      email: email || null,
      level,
      emailVerified: decoded.email_verified === true,
      signInProvider: decoded.firebase?.sign_in_provider ?? null,
      claimsLevel: typeof decoded.appLevel === 'string' ? decoded.appLevel : null,
    },
  };
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('firebase-admin/auth').DecodedIdToken} decoded
 * @param {{ requireListed?: boolean }} [opts]
 * @returns {{ ok: boolean, error?: string, statusCode?: number }}
 */
export function attachRequestUser(request, decoded, opts = {}) {
  const built = buildRequestUserFromDecoded(decoded, opts);
  if (built.error) {
    return { ok: false, error: built.error, statusCode: 403 };
  }
  request.user = built.user;
  return { ok: true };
}
