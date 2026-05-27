import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';

export function AppLayout({
  header,
  footer,
  children,
  maxWidth = 1320,
  contentSpacing = 5,
}) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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
                paddingTop: theme.spacing(2),
                paddingBottom: theme.spacing(2),
                flexWrap: 'wrap',
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
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing(contentSpacing),
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
