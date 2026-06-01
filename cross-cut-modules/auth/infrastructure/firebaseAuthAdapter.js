/**
 * Firebase Admin implementation of IAuthPort.
 */

import {
  initFirebaseAdminForAuth,
  isEmailVerificationSatisfied,
  verifyIdTokenFromAuthorizationHeader,
} from '../firebaseAdmin.js';

/** @type {import('../domain/ports/IAuthPort.js').IAuthPort | null} */
let defaultPort = null;

/**
 * @returns {import('../domain/ports/IAuthPort.js').IAuthPort}
 */
export function createFirebaseAuthAdapter() {
  return {
    initAuth: initFirebaseAdminForAuth,
    isEmailVerified: isEmailVerificationSatisfied,
    verifyToken: verifyIdTokenFromAuthorizationHeader,
  };
}

/**
 * @returns {import('../domain/ports/IAuthPort.js').IAuthPort}
 */
export function getDefaultAuthPort() {
  if (!defaultPort) {
    defaultPort = createFirebaseAuthAdapter();
  }
  return defaultPort;
}
