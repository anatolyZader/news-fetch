import { useState } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import { useAuth } from '../context/AuthContext.jsx';
import { SiteFooter } from '../ui/SiteFooter.jsx';

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
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.default',
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 4,
        }}
      >
        <Container maxWidth="xs">
          <Paper
            variant="outlined"
            sx={(theme) => ({ p: { xs: 3, sm: 4 }, borderRadius: theme.custom.radius.xl })}
          >
            <Stack spacing={2.25}>
              <Typography variant="h1" sx={{ textAlign: 'center' }}>Sign in</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                Uses Google <strong>Identity Platform</strong> (Firebase Auth): email/password and Google account.
              </Typography>

              <Button
                type="button"
                variant="contained"
                onClick={onGoogle}
                disabled={busy}
                fullWidth
              >
                Continue with Google
              </Button>

              <Divider>or</Divider>

              <Box component="form" onSubmit={onSubmit}>
                <Stack spacing={2}>
                  <TextField
                    label="Email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Password"
                    type="password"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    inputProps={{ minLength: 6 }}
                    fullWidth
                    size="small"
                  />

                  {authError && <Alert severity="error">{authError}</Alert>}
                  {resetSent && <Alert severity="success">Reset email sent — check your inbox.</Alert>}

                  <Button
                    type="submit"
                    variant="contained"
                    disabled={busy}
                    fullWidth
                  >
                    {mode === 'signin' ? 'Sign in' : 'Create account'}
                  </Button>

                  {mode === 'signin' && (
                    <Button
                      type="button"
                      variant="text"
                      size="small"
                      onClick={onResetPassword}
                      disabled={busy}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      Forgot password?
                    </Button>
                  )}
                </Stack>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                {mode === 'signin' ? (
                  <>
                    No account?{' '}
                    <Button
                      type="button"
                      variant="text"
                      size="small"
                      onClick={() => setMode('signup')}
                      sx={{ p: 0, minWidth: 0, verticalAlign: 'baseline' }}
                    >
                      Register
                    </Button>
                  </>
                ) : (
                  <>
                    Already registered?{' '}
                    <Button
                      type="button"
                      variant="text"
                      size="small"
                      onClick={() => setMode('signin')}
                      sx={{ p: 0, minWidth: 0, verticalAlign: 'baseline' }}
                    >
                      Sign in
                    </Button>
                  </>
                )}
              </Typography>
            </Stack>
          </Paper>
        </Container>
      </Box>
      <SiteFooter variant="minimal" />
    </Box>
  );
}
