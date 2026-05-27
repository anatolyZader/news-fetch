import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { LoginScreen } from './components/LoginScreen.jsx';
import { MainApp } from './MainApp.jsx';
import { AppProviders } from './theme/AppProviders.jsx';
import PropTypes from 'prop-types';

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppProviders>
          <AuthGate />
        </AppProviders>
      </LanguageProvider>
    </AuthProvider>
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
    authRequired,
    firebaseConfigured,
    user,
    authLoading,
  } = useAuth();

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
    return <LoginScreen />;
  }

  return <MainApp />;
}
