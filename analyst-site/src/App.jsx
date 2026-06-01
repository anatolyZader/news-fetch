import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import PropTypes from 'prop-types';

import { AuthProvider, useAuth } from '@client/context/AuthContext.jsx';
import { LanguageProvider } from '@client/context/LanguageContext.jsx';
import { LoginScreen } from '@client/components/LoginScreen.jsx';
import { AppProviders } from '@client/theme/AppProviders.jsx';
import { AppErrorBoundary } from '@client/components/AppErrorBoundary.jsx';
import { useDisplayCapabilities } from '@client/hooks/useDisplayCapabilities.js';

import { AnalystApp } from './AnalystApp.jsx';

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <LanguageProvider>
          <AppProviders>
            <AnalystGate />
          </AppProviders>
        </LanguageProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}

function CenteredWrap({ children }) {
  return (
    <Box
      sx={(theme) => ({
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing(4),
      })}
    >
      {children}
    </Box>
  );
}

CenteredWrap.propTypes = {
  children: PropTypes.node,
};

function AnalystGate() {
  const {
    configLoaded,
    configError,
    authRequired,
    firebaseConfigured,
    user,
    authLoading,
    logout,
  } = useAuth();
  const { canViewAnalyst, ready: capabilitiesReady } = useDisplayCapabilities();

  if (configLoaded && configError) {
    return (
      <CenteredWrap>
        <Alert severity="error" variant="outlined" sx={{ maxWidth: '36rem' }}>
          Cannot reach the server auth configuration ({configError}). Check network connectivity and reload.
        </Alert>
      </CenteredWrap>
    );
  }

  if (!configLoaded || (authRequired && firebaseConfigured && authLoading)) {
    return (
      <CenteredWrap>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '36rem' }}>
          Loading…
        </Typography>
      </CenteredWrap>
    );
  }

  if (authRequired && !firebaseConfigured) {
    return (
      <CenteredWrap>
        <Alert severity="warning" variant="outlined" sx={{ maxWidth: '36rem' }}>
          This workspace requires Firebase web config at build time. Set{' '}
          <Box component="code" sx={{ fontSize: '0.85em' }}>VITE_FIREBASE_API_KEY</Box>,{' '}
          <Box component="code" sx={{ fontSize: '0.85em' }}>VITE_FIREBASE_AUTH_DOMAIN</Box>, and{' '}
          <Box component="code" sx={{ fontSize: '0.85em' }}>VITE_FIREBASE_PROJECT_ID</Box> when building
          analyst-site.
        </Alert>
      </CenteredWrap>
    );
  }

  if (authRequired && !user) {
    return <LoginScreen />;
  }

  if (!capabilitiesReady) {
    return (
      <CenteredWrap>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '36rem' }}>
          Checking analyst access…
        </Typography>
      </CenteredWrap>
    );
  }

  if (!canViewAnalyst) {
    return (
      <CenteredWrap>
        <Alert severity="error" variant="outlined" sx={{ maxWidth: '32rem' }}>
          <Typography variant="subtitle2" gutterBottom>
            Analyst access required
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ marginBottom: 2 }}>
            {user?.email
              ? `Signed in as ${user.email}, but this account is not listed in config/userAccess.json with analyst or maintainer level.`
              : 'Sign in with an allowlisted analyst account to use this workspace.'}
          </Typography>
          <StackActions logout={logout} authRequired={authRequired} user={user} />
        </Alert>
      </CenteredWrap>
    );
  }

  return <AnalystApp logout={logout} user={user} authRequired={authRequired} />;
}

function StackActions({ logout, authRequired, user }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <Button component={Link} href="https://vibeswitch.ai" variant="outlined" size="small">
        Operator app
      </Button>
      {authRequired && user && (
        <Button variant="text" size="small" onClick={() => logout()}>
          Sign out
        </Button>
      )}
    </Box>
  );
}

StackActions.propTypes = {
  logout: PropTypes.func.isRequired,
  authRequired: PropTypes.bool,
  user: PropTypes.object,
};
