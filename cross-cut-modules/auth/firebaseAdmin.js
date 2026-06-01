/**
 * Identity Platform — server-side ID token verification via Firebase Admin SDK.
 *
 * @see docs/IDENTITY_PLATFORM_SETUP.md
 */
import admin from 'firebase-admin';
import { shouldCheckRevokedTokens } from './authPolicy.js';

let initialized = false;

/**
 * @param {string} projectId  GCP project / Firebase project ID
 */
export function initFirebaseAdminForAuth(projectId) {
  if (!projectId?.trim()) {
    throw new Error('FIREBASE_PROJECT_ID is required when AUTH_REQUIRED=true');
  }
  if (initialized) return;
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: projectId.trim(),
    });
  }
  initialized = true;
}

/**
 * @param {import('firebase-admin/auth').DecodedIdToken} decoded
 * @returns {string | undefined}
 */
function signInProviderFromDecoded(decoded) {
  return decoded.firebase?.sign_in_provider ?? null;
}

/**
 * Password sign-in requires verified email before API access.
 * @param {import('firebase-admin/auth').DecodedIdToken} decoded
 * @returns {boolean}
 */
export function isEmailVerificationSatisfied(decoded) {
  const provider = signInProviderFromDecoded(decoded);
  if (provider !== 'password') return true;
  return decoded.email_verified === true;
}

/**
 * @param {string | undefined} authorization  `Bearer <idToken>`
 * @param {{ checkRevoked?: boolean }} [opts]
 * @returns {Promise<{ decoded?: import('firebase-admin/auth').DecodedIdToken, error?: string }>}
 */
export async function verifyIdTokenFromAuthorizationHeader(authorization, opts = {}) {
  if (!authorization || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return { error: 'missing_token' };
  }
  const token = authorization.slice(7).trim();
  if (!token) {
    return { error: 'missing_token' };
  }
  const checkRevoked = opts.checkRevoked ?? shouldCheckRevokedTokens();
  try {
    const decoded = await admin.auth().verifyIdToken(token, checkRevoked);
    if (!isEmailVerificationSatisfied(decoded)) {
      return { error: 'email_not_verified' };
    }
    return { decoded };
  } catch (err) {
    const code = err?.code ?? '';
    if (code === 'auth/id-token-revoked') {
      return { error: 'token_revoked' };
    }
    return { error: 'invalid_token' };
  }
}
