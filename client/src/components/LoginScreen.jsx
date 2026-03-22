import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './LoginScreen.module.css';

export function LoginScreen() {
  const { signInEmail, signUpEmail, signInGoogle, resetPassword, authError, setAuthError } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setAuthError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInEmail(email.trim(), password);
      } else {
        await signUpEmail(email.trim(), password);
      }
    } catch (err) {
      setAuthError(err?.message ?? 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function onResetPassword() {
    if (!email.trim()) {
      setAuthError('Enter your email address above, then click Forgot password.');
      return;
    }
    setAuthError(null);
    setBusy(true);
    try {
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (err) {
      setAuthError(err?.message ?? 'Could not send reset email');
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setAuthError(null);
    setBusy(true);
    try {
      await signInGoogle();
    } catch (err) {
      setAuthError(err?.message ?? 'Google sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.hint}>
          Uses Google <strong>Identity Platform</strong> (Firebase Auth): email/password and Google account.
        </p>

        <button type="button" className={styles.primary} onClick={onGoogle} disabled={busy}>
          Continue with Google
        </button>

        <div className={styles.divider}>or</div>

        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.label}>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={styles.input}
            />
          </label>
          <label className={styles.label}>
            Password
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className={styles.input}
            />
          </label>

          {authError && <div className={styles.error}>{authError}</div>}
          {resetSent && <div className={styles.success}>Reset email sent — check your inbox.</div>}

          <button type="submit" className={styles.primary} disabled={busy}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          {mode === 'signin' && (
            <button type="button" className={styles.link} onClick={onResetPassword} disabled={busy}>
              Forgot password?
            </button>
          )}
        </form>

        <p className={styles.toggle}>
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button type="button" className={styles.link} onClick={() => setMode('signup')}>
                Register
              </button>
            </>
          ) : (
            <>
              Already registered?{' '}
              <button type="button" className={styles.link} onClick={() => setMode('signin')}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
