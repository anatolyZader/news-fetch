import { useMemo } from 'react';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { buildTheme } from './theme.js';
import { getEmotionCache } from './createEmotionCache.js';
import PropTypes from 'prop-types';

export function AppProviders({ children }) {
  const cache = useMemo(() => getEmotionCache('ltr'), []);
  const theme = useMemo(() => buildTheme('ltr'), []);

  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}

AppProviders.propTypes = {
  children: PropTypes.node,
};
