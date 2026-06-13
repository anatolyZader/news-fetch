import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';
import { mobileDashboardPageSx } from './responsive/mobileDashboardSx.js';
import { mobilePageGapSx } from './responsive/responsiveSx.js';

export function AppLayout({
  header,
  footer,
  children,
  maxWidth = 1320,
  contentSpacing = 5,
}) {
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
          flex: 1,
          width: '100%',
          maxWidth: `${maxWidth}px !important`,
          marginLeft: 'auto',
          marginRight: 'auto',
          paddingTop: `${theme.spacing(5)} !important`,
          paddingBottom: `${theme.spacing(7)} !important`,
          paddingLeft: `${theme.spacing(4)} !important`,
          paddingRight: `${theme.spacing(4)} !important`,
          [theme.breakpoints.down('sm')]: {
            paddingLeft: `${theme.spacing(2)} !important`,
            paddingRight: `${theme.spacing(2)} !important`,
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
      {footer}
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
