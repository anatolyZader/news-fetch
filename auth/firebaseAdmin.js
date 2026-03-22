/**
 * Identity Platform — server-side ID token verification via Firebase Admin SDK.
 *
 * Google Cloud Identity Platform uses the Identity Toolkit API. The Admin SDK
 * (`firebase-admin`) is the supported Node.js library to verify ID tokens:
 * https://cloud.google.com/identity-platform/docs/install-admin-sdk
 *
 * Credentials:
 * - Cloud Run / GCE: Application Default Credentials (attach a service account with
 *   Identity Toolkit / Identity Platform admin access).
 * - Local: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *
 * @see docs/IDENTITY_PLATFORM_SETUP.md
 */
import admin from 'firebase-admin';

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
 * @param {string | undefined} authorization  `Bearer <idToken>`
 * @returns {Promise<{ decoded?: import('firebase-admin/auth').DecodedIdToken, error?: string }>}
 */
export async function verifyIdTokenFromAuthorizationHeader(authorization) {
  if (!authorization || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return { error: 'missing_token' };
  }
  const token = authorization.slice(7).trim();
  if (!token) {
    return { error: 'missing_token' };
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return { decoded };
  } catch {
    return { error: 'invalid_token' };
  }
}
