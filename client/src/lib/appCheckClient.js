/**
 * Firebase App Check token helper for the SPA.
 */

import { getApps } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'firebase/app-check';

let appCheckInstance = null;
let appCheckInitError = null;

/** Call after sign-out so the next session can re-initialize App Check. */
export function resetAppCheckClient() {
  appCheckInstance = null;
  appCheckInitError = null;
}

export function ensureAppCheckInitialized() {
  if (appCheckInstance) return appCheckInstance;
  if (appCheckInitError) return null;
  const apps = getApps();
  if (apps.length === 0) return null;

  const siteKey = import.meta.env.VITE_APP_CHECK_SITE_KEY?.trim();
  if (!siteKey) return null;

  const debugToken = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN?.trim();
  if (debugToken && import.meta.env.DEV) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }

  try {
    appCheckInstance = initializeAppCheck(apps[0], {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return appCheckInstance;
  } catch (err) {
    appCheckInitError = err;
    return null;
  }
}

function getOrInitAppCheck() {
  return ensureAppCheckInitialized();
}

export async function getAppCheckToken(forceRefresh = false) {
  const check = getOrInitAppCheck();
  if (!check) return null;
  try {
    const result = await getToken(check, forceRefresh);
    return result?.token ?? null;
  } catch (err) {
    appCheckInitError = err;
    return null;
  }
}

export function getAppCheckLastError() {
  return appCheckInitError;
}
