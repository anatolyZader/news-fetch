import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { getFirebaseWebConfig, isFirebaseClientConfigured, isAppCheckConfigured } from '../lib/firebaseClient.js';
import { getAppCheckToken as fetchAppCheckToken, ensureAppCheckInitialized } from '../lib/appCheckClient.js';
import PropTypes from 'prop-types';

const AuthContext = createContext(null);

function getOrInitApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp(getFirebaseWebConfig());
}

export function AuthProvider({ children }) {
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configError, setConfigError] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [appCheckEnforced, setAppCheckEnforced] = useState(false);
  const [disableSignup, setDisableSignup] = useState(import.meta.env.PROD);
  const [membershipDenied, setMembershipDenied] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const tokenCacheRef = useRef({ token: null, expiresAt: 0, inflight: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/config');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setConfigError(null);
          setAuthRequired(Boolean(data.authRequired));
          setAppCheckEnforced(Boolean(data.appCheckEnforced));
          setDisableSignup(
            data.disableSignup !== false
            && (import.meta.env.VITE_DISABLE_SIGNUP !== 'false'),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setConfigError(err?.message ?? 'Could not load auth configuration');
          setAuthRequired(true);
        }
      } finally {
        if (!cancelled) setConfigLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!configLoaded) return;
    if (!authRequired || !isFirebaseClientConfigured()) {
      queueMicrotask(() => setAuthLoading(false));
      return;
    }

    const app = getOrInitApp();
    const auth = getAuth(app);
    ensureAppCheckInitialized();

    const unsub = onAuthStateChanged(auth, async (u) => {
      setMembershipDenied(false);
      if (!u) {
        setUser(null);
        setAuthLoading(false);
        return;
      }
      try {
        const tok = await u.getIdToken();
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${tok}` },
        });
        const me = await meRes.json().catch(() => ({}));
        if (meRes.status === 403 && me?.code === 'forbidden_not_invited') {
          setMembershipDenied(true);
          setAuthError(me?.message ?? 'Account is not authorized for this application.');
          await signOut(auth);
          setUser(null);
          setAuthLoading(false);
          return;
        }
      } catch {
        /* proceed — API may be unreachable in dev */
      }
      setUser(u);
      setAuthLoading(false);
    });

    return () => unsub();
  }, [configLoaded, authRequired]);

  const getIdToken = useCallback(async (opts = {}) => {
    const forceRefresh = Boolean(opts?.forceRefresh);
    if (!authRequired) return null;
    if (!isFirebaseClientConfigured()) return null;
    getOrInitApp();
    const auth = getAuth();
    const u = auth.currentUser;
    if (!u) return null;
    const now = Date.now();
    if (!forceRefresh && tokenCacheRef.current.token && tokenCacheRef.current.expiresAt > now) {
      return tokenCacheRef.current.token;
    }
    if (!forceRefresh && tokenCacheRef.current.inflight) {
      return tokenCacheRef.current.inflight;
    }
    const p = u.getIdToken(forceRefresh).then((tok) => {
      tokenCacheRef.current.token = tok ?? null;
      tokenCacheRef.current.expiresAt = Date.now() + 60_000;
      tokenCacheRef.current.inflight = null;
      return tok ?? null;
    }).catch(() => {
      tokenCacheRef.current.inflight = null;
      return null;
    });
    if (!forceRefresh) tokenCacheRef.current.inflight = p;
    return p;
  }, [authRequired]);

  const getAppCheckToken = useCallback(async (opts = {}) => {
    if (!isAppCheckConfigured()) return null;
    getOrInitApp();
    return fetchAppCheckToken(Boolean(opts?.forceRefresh));
  }, []);

  /** Ready to call protected APIs: server open, or user signed in */
  const apiReady = useMemo(() => {
    if (!configLoaded) return false;
    if (!authRequired) return true;
    if (!isFirebaseClientConfigured()) return false;
    return !!user;
  }, [configLoaded, authRequired, user]);

  const appCheckRequired = appCheckEnforced || isAppCheckConfigured();
  const [costlyRouteReady, setCostlyRouteReady] = useState(() => !appCheckRequired);
  const [appCheckError, setAppCheckError] = useState(null);

  useEffect(() => {
    if (!apiReady) {
      queueMicrotask(() => {
        setCostlyRouteReady(false);
        setAppCheckError(null);
      });
      return undefined;
    }
    if (!appCheckRequired) {
      queueMicrotask(() => {
        setCostlyRouteReady(true);
        setAppCheckError(null);
      });
      return undefined;
    }
    if (!isAppCheckConfigured()) {
      queueMicrotask(() => {
        setCostlyRouteReady(false);
        setAppCheckError('missing_site_key');
      });
      return undefined;
    }
    queueMicrotask(() => { setAppCheckError(null); });
    ensureAppCheckInitialized();
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < 48; attempt += 1) {
        const tok = await fetchAppCheckToken(attempt > 0);
        if (cancelled) return;
        if (tok) {
          setCostlyRouteReady(true);
          setAppCheckError(null);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!cancelled) {
        setCostlyRouteReady(false);
        setAppCheckError('token_timeout');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiReady, appCheckRequired]);

  const signInEmail = useCallback(async (email, password) => {
    setAuthError(null);
    getOrInitApp();
    const auth = getAuth();
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpEmail = useCallback(async (email, password) => {
    if (disableSignup) {
      throw new Error('Registration is disabled. Contact an administrator for access.');
    }
    setAuthError(null);
    getOrInitApp();
    const auth = getAuth();
    await createUserWithEmailAndPassword(auth, email, password);
  }, [disableSignup]);

  const signInGoogle = useCallback(async () => {
    setAuthError(null);
    getOrInitApp();
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }, []);

  const resetPassword = useCallback(async (email) => {
    getOrInitApp();
    const auth = getAuth();
    await sendPasswordResetEmail(auth, email);
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    if (!isFirebaseClientConfigured()) return;
    getOrInitApp();
    const auth = getAuth();
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({
      configLoaded,
      configError,
      authRequired,
      disableSignup,
      membershipDenied,
      firebaseConfigured: isFirebaseClientConfigured(),
      user,
      authLoading,
      authError,
      setAuthError,
      apiReady,
      appCheckEnforced,
      appCheckRequired,
      appCheckError,
      costlyRouteReady,
      getIdToken,
      getAppCheckToken,
      signInEmail,
      signUpEmail,
      signInGoogle,
      resetPassword,
      logout,
    }),
    [
      configLoaded,
      configError,
      authRequired,
      disableSignup,
      membershipDenied,
      user,
      authLoading,
      authError,
      apiReady,
      appCheckEnforced,
      appCheckRequired,
      appCheckError,
      costlyRouteReady,
      getIdToken,
      getAppCheckToken,
      signInEmail,
      signUpEmail,
      signInGoogle,
      resetPassword,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node,
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
