/**
 * Firebase JS SDK web config (public values — safe in the Vite bundle).
 * Source: Firebase Console → Project settings → Your apps → Web app config object.
 * Backend product: Google Identity Platform (Identity Toolkit); same project ID as GCP.
 */

function pickDefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ''));
}

/**
 * @returns {import('firebase/app').FirebaseOptions}
 */
export function getFirebaseWebConfig() {
  return pickDefined({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  });
}

export function isFirebaseClientConfigured() {
  const c = getFirebaseWebConfig();
  return Boolean(c.apiKey && c.authDomain && c.projectId);
}

export function isAppCheckConfigured() {
  return Boolean(import.meta.env.VITE_APP_CHECK_SITE_KEY?.trim());
}
