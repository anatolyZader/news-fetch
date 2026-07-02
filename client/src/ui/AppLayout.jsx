import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';
import { mobileDashboardPageSx } from './responsive/mobileDashboardSx.js';
import { mobilePageGapSx } from './responsive/responsiveSx.js';
import { APP_CONTENT_MAX_WIDTH, appContentContainerSx } from './appShellLayout.js';

export function AppLayout({
  header,
  footer,
  children,
  maxWidth = APP_CONTENT_MAX_WIDTH,
  contentSpacing = 5,
}) {
  const shellSx = (theme, overrides = {}) => appContentContainerSx(theme, maxWidth, overrides);

  return (
    <Box sx={{ minHeight: ['100vh', '100dvh'], display: 'flex', flexDirection: 'column' }}>
      {header && (
        <AppBar
          position="static"
          color="inherit"
          elevation={0}
          sx={(theme) => ({
            background: `linear-gradient(180deg, ${alpha(theme.palette.background.paper, 0.92)} 0%, ${theme.palette.background.paper} 100%)`,
            backdropFilter: 'blur(12px)',
            borderBottom: theme.custom.border.hairline,
            boxShadow: 'none',
          })}
        >
          <Toolbar
            disableGutters
            sx={(theme) => ({
              direction: 'ltr',
              paddingLeft: theme.spacing(4),
              paddingRight: theme.spacing(4),
              paddingTop: theme.spacing(2.5),
              paddingBottom: theme.spacing(2.5),
              gap: theme.spacing(2),
              flexWrap: 'nowrap',
              [theme.breakpoints.down('sm')]: {
                paddingLeft: theme.spacing(2),
                paddingRight: theme.spacing(2),
                paddingTop: theme.spacing(1.5),
                paddingBottom: theme.spacing(1.5),
                flexWrap: 'nowrap',
                alignItems: 'center',
              },
            })}
          >
            {header}
          </Toolbar>
        </AppBar>
      )}
      <Container
        component="main"
        maxWidth={false}
        sx={(theme) => ({
          ...shellSx(theme),
          flex: 1,
          paddingTop: `${theme.spacing(5)} !important`,
          paddingBottom: `${theme.spacing(7)} !important`,
          [theme.breakpoints.down('sm')]: {
            paddingTop: `${theme.spacing(2)} !important`,
            paddingBottom: `${theme.spacing(12)} !important`,
          },
          [theme.breakpoints.between('sm', 'md')]: {
            paddingBottom: `${theme.spacing(10)} !important`,
          },
          ...mobileDashboardPageSx(theme),
          display: 'flex',
          flexDirection: 'column',
          ...mobilePageGapSx(theme, contentSpacing),
        })}
      >
        {children}
      </Container>
      {footer && (
        <Box sx={{ width: '100%', marginTop: 'auto' }}>
          <Container
            maxWidth={false}
            sx={(theme) => shellSx(theme, {
              paddingTop: 0,
              paddingBottom: 0,
            })}
          >
            {footer}
          </Container>
        </Box>
      )}
    </Box>
  );
}

AppLayout.propTypes = {
  header: PropTypes.node,
  footer: PropTypes.node,
  children: PropTypes.node,
  maxWidth: PropTypes.number,
  contentSpacing: PropTypes.number,
};
