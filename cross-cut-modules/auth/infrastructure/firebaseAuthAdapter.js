import {
  initFirebaseAdminForAuth,
  verifyIdTokenFromAuthorizationHeader,
} from '../firebaseAdmin.js';

/**
 * @returns {import('../domain/ports/IAuthPort.js').IAuthPort & { verifyToken: (authorization?: string) => Promise<{ decoded?: object, error?: string }> }}
 */
export function createFirebaseAuthAdapter() {
  return {
    init: initFirebaseAdminForAuth,
    verifyToken: (authorization, opts) => verifyIdTokenFromAuthorizationHeader(authorization, opts),
    isEmailVerified: async () => true,
  };
}

let defaultPort = null;

export function getDefaultAuthPort() {
  if (!defaultPort) defaultPort = createFirebaseAuthAdapter();
  return defaultPort;
}

export function setDefaultAuthPort(port) {
  defaultPort = port;
}
