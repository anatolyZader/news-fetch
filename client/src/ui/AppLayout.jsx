import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';

export function AppLayout({
  header,
  children,
  maxWidth = 1180,
  contentSpacing = 4,
}) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {header && (
        <AppBar
          position="static"
          color="inherit"
          elevation={0}
          sx={(theme) => ({
            background: theme.palette.background.paper,
            borderBottom: theme.custom.border.hairline,
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
          paddingTop: `${theme.spacing(4)} !important`,
          paddingBottom: `${theme.spacing(4)} !important`,
          paddingLeft: `${theme.spacing(3)} !important`,
          paddingRight: `${theme.spacing(3)} !important`,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing(contentSpacing),
        })}
      >
        {children}
      </Container>
    </Box>
  );
}
