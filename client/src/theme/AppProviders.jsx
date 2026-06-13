import { useMemo } from 'react';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { buildTheme } from './theme.js';
import { getEmotionCache } from './createEmotionCache.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import PropTypes from 'prop-types';

function ThemeProviders({ children }) {
  const { lang } = useLanguage();
  const direction = lang === 'he' ? 'rtl' : 'ltr';
  const cache = useMemo(() => getEmotionCache(direction), [direction]);
  const theme = useMemo(() => buildTheme(direction), [direction]);

  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}

ThemeProviders.propTypes = {
  children: PropTypes.node,
};

export function AppProviders({ children }) {
  return <ThemeProviders>{children}</ThemeProviders>;
}

AppProviders.propTypes = {
  children: PropTypes.node,
};
