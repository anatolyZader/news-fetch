/** CSP additions for Firebase App Check + reCAPTCHA Enterprise (invisible). */
export function appCheckCspDirectives(env = process.env) {
  if (env.APP_CHECK_ENFORCE !== 'true') {
    return { scriptSrc: [], frameSrc: [], connectSrc: [] };
  }
  return {
    scriptSrc: [
      'https://www.google.com',
      'https://www.gstatic.com',
      'https://apis.google.com',
    ],
    frameSrc: [
      'https://www.google.com',
      'https://recaptcha.google.com',
    ],
    connectSrc: [
      'https://firebaseappcheck.googleapis.com',
      'https://content-firebaseappcheck.googleapis.com',
    ],
  };
}

/** CSP additions for Firebase Auth + Google Identity (OAuth popup, token refresh). */
export function firebaseAuthCspDirectives(env = process.env) {
  const authRequired = env.AUTH_REQUIRED === 'true';
  const hasFirebaseProject = !!(env.FIREBASE_PROJECT_ID ?? '').trim();
  if (!authRequired && !hasFirebaseProject) {
    return { connectSrc: [], scriptSrc: [], frameSrc: [] };
  }
  return {
    connectSrc: [
      'https://*.googleapis.com',
      'https://*.google.com',
      'https://securetoken.googleapis.com',
      'https://identitytoolkit.googleapis.com',
      'https://www.googleapis.com',
      'https://firebase.googleapis.com',
      'https://firebaseinstallations.googleapis.com',
      'https://*.firebaseio.com',
      'wss://*.firebaseio.com',
    ],
    scriptSrc: [
      'https://apis.google.com',
      'https://www.gstatic.com',
      'https://www.google.com',
    ],
    frameSrc: [
      'https://accounts.google.com',
      'https://*.firebaseapp.com',
      'https://apis.google.com',
    ],
  };
}

function unique(values) {
  return [...new Set(values)];
}

/**
 * Production-safe CSP that allows Firebase Auth, App Check, and same-origin API calls.
 * ENABLE_STRICT_CSP must stay true in production (see validateProductionSecurity) but must
 * not disable CSP — helmet defaults block all external connect/script without Firebase hosts.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function buildContentSecurityPolicyDirectives(env = process.env) {
  const appCheckCsp = appCheckCspDirectives(env);
  const firebaseCsp = firebaseAuthCspDirectives(env);
  const strict = env.ENABLE_STRICT_CSP === 'true';

  const connectSrc = strict
    ? unique(["'self'", ...firebaseCsp.connectSrc, ...appCheckCsp.connectSrc])
    : unique(["'self'", 'https:', ...firebaseCsp.connectSrc, ...appCheckCsp.connectSrc]);

  return {
    defaultSrc: ["'self'"],
    scriptSrc: unique([
      "'self'",
      "'unsafe-inline'",
      ...firebaseCsp.scriptSrc,
      ...appCheckCsp.scriptSrc,
    ]),
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc,
    fontSrc: ["'self'", 'https:', 'data:'],
    frameSrc: unique(["'self'", ...firebaseCsp.frameSrc, ...appCheckCsp.frameSrc]),
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  };
}
