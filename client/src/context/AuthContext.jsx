import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { getFirebaseWebConfig, isFirebaseClientConfigured } from '../lib/firebaseClient.js';

const AuthContext = createContext(null);

function getOrInitApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp(getFirebaseWebConfig());
}

export function AuthProvider({ children }) {
  const [configLoaded, setConfigLoaded] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/config');
        const data = await res.json();
        if (!cancelled) {
          setAuthRequired(Boolean(data.authRequired));
        }
      } catch {
        if (!cancelled) setAuthRequired(false);
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
    if (!authRequired) {
      setAuthLoading(false);
      return;
    }
    if (!isFirebaseClientConfigured()) {
      setAuthLoading(false);
      return;
    }

    const app = getOrInitApp();
    const auth = getAuth(app);

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });

    return () => unsub();
  }, [configLoaded, authRequired]);

  const getIdToken = useCallback(async () => {
    if (!authRequired) return null;
    if (!isFirebaseClientConfigured()) return null;
    getOrInitApp();
    const auth = getAuth();
    const u = auth.currentUser;
    if (!u) return null;
    return u.getIdToken();
  }, [authRequired]);

  /** Ready to call protected APIs: server open, or user signed in */
  const apiReady = useMemo(() => {
    if (!configLoaded) return false;
    if (!authRequired) return true;
    if (!isFirebaseClientConfigured()) return false;
    return !!user;
  }, [configLoaded, authRequired, user]);

  const signInEmail = useCallback(async (email, password) => {
    setAuthError(null);
    getOrInitApp();
    const auth = getAuth();
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpEmail = useCallback(async (email, password) => {
    setAuthError(null);
    getOrInitApp();
    const auth = getAuth();
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

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
      authRequired,
      firebaseConfigured: isFirebaseClientConfigured(),
      user,
      authLoading,
      authError,
      setAuthError,
      apiReady,
      getIdToken,
      signInEmail,
      signUpEmail,
      signInGoogle,
      resetPassword,
      logout,
    }),
    [
      configLoaded,
      authRequired,
      user,
      authLoading,
      authError,
      apiReady,
      getIdToken,
      signInEmail,
      signUpEmail,
      signInGoogle,
      resetPassword,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
