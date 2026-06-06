import { lazy, Suspense } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { BootstrapLoading } from './ui/BootstrapLoading.jsx';
import { parsePanelPath } from './lib/panelRoutes.js';
import { AppProviders } from './theme/AppProviders.jsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.jsx';
import PropTypes from 'prop-types';

const LoginScreen = lazy(() => import('./components/LoginScreen.jsx').then((m) => ({ default: m.LoginScreen })));
const MainApp = lazy(() => import('./MainApp.jsx').then((m) => ({ default: m.MainApp })));
const PanelWindowApp = lazy(() => import('./PanelWindowApp.jsx').then((m) => ({ default: m.PanelWindowApp })));

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <LanguageProvider>
          <AppProviders>
            <AuthGate />
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

function AuthGate() {
  const {
    configLoaded,
    configError,
    authRequired,
    firebaseConfigured,
    user,
    authLoading,
  } = useAuth();

  const panelId = parsePanelPath(globalThis.location?.pathname);

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
    if (panelId) return <BootstrapLoading />;
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
          This server requires signed-in users, but the client is missing Firebase web config. Set{' '}
          <Box component="code" sx={{ fontSize: '0.85em' }}>VITE_FIREBASE_API_KEY</Box>,{' '}
          <Box component="code" sx={{ fontSize: '0.85em' }}>VITE_FIREBASE_AUTH_DOMAIN</Box>, and{' '}
          <Box component="code" sx={{ fontSize: '0.85em' }}>VITE_FIREBASE_PROJECT_ID</Box> when building the client, and enable Email/Password and Google in
          Firebase Console {'→'} Authentication.
        </Alert>
      </CenteredWrap>
    );
  }

  if (authRequired && !user) {
    return (
      <Suspense fallback={<AppLoadingFallback />}>
        <LoginScreen />
      </Suspense>
    );
  }

  if (panelId) {
    return (
      <Suspense fallback={<BootstrapLoading />}>
        <PanelWindowApp panelId={panelId} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<AppLoadingFallback />}>
      <MainApp />
    </Suspense>
  );
}

function AppLoadingFallback() {
  return <BootstrapLoading />;
}
