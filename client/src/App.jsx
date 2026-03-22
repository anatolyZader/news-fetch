import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { LoginScreen } from './components/LoginScreen.jsx';
import { MainApp } from './MainApp.jsx';
import styles from './App.module.css';

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const {
    configLoaded,
    authRequired,
    firebaseConfigured,
    user,
    authLoading,
  } = useAuth();

  if (!configLoaded || (authRequired && firebaseConfigured && authLoading)) {
    return (
      <div className={styles.loadingWrap}>
        <p className={styles.loadingText}>Loading…</p>
      </div>
    );
  }

  if (authRequired && !firebaseConfigured) {
    return (
      <div className={styles.loadingWrap}>
        <p className={styles.configError}>
          This server requires signed-in users, but the client is missing Firebase web config. Set{' '}
          <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_AUTH_DOMAIN</code>, and{' '}
          <code>VITE_FIREBASE_PROJECT_ID</code> when building the client, and enable Email/Password and Google in
          Firebase Console → Authentication.
        </p>
      </div>
    );
  }

  if (authRequired && !user) {
    return <LoginScreen />;
  }

  return <MainApp />;
}
