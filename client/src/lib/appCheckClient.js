/**
 * Firebase App Check token helper for the SPA.
 */

import { getApps } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'firebase/app-check';

let appCheckInstance = null;

function getOrInitAppCheck() {
  if (appCheckInstance) return appCheckInstance;
  const apps = getApps();
  if (apps.length === 0) return null;

  const siteKey = import.meta.env.VITE_APP_CHECK_SITE_KEY?.trim();
  if (!siteKey) return null;

  const debugToken = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN?.trim();
  if (debugToken && import.meta.env.DEV) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }

  appCheckInstance = initializeAppCheck(apps[0], {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheckInstance;
}

export async function getAppCheckToken(forceRefresh = false) {
  const check = getOrInitAppCheck();
  if (!check) return null;
  try {
    const result = await getToken(check, forceRefresh);
    return result?.token ?? null;
  } catch {
    return null;
  }
}
