import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

/**
 * Page-level header: title, optional inline scope (e.g. district switcher), subtitle, action slot.
 * Scope sits beside the title; actions stay on the right.
 */
export function PageHeader({ title, subtitle, scope, action }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'center', sm: 'center' }}
      useFlexGap
      flexWrap="wrap"
      spacing={{ xs: 1, sm: 1.2 }}
      sx={{ width: '100%', minWidth: 0 }}
    >
      <Box sx={{
        flex: { xs: '0 0 auto', sm: action ? 1 : '0 1 auto' },
        minWidth: 0,
        width: { xs: '100%', sm: 'auto' },
        display: 'flex',
        flexDirection: 'column',
        alignItems: { xs: 'center', sm: 'flex-start' },
        textAlign: { xs: 'center', sm: 'left' },
      }}
      >
        {(title || scope) && (
          <Stack
            direction="row"
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            spacing={1}
            sx={(theme) => ({
              minWidth: 0,
              justifyContent: { xs: 'center', sm: 'flex-start' },
              width: { xs: '100%', sm: 'auto' },
              [theme.breakpoints.down('sm')]: {
                flexDirection: 'column',
              },
            })}
          >
            {title && (
              <Typography
                variant="h2"
                component="h2"
                sx={(theme) => ({
                  flex: '1 1 auto',
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  margin: 0,
                  [theme.breakpoints.down('sm')]: {
                    whiteSpace: 'normal',
                    width: '100%',
                    justifyContent: 'center',
                  },
                })}
              >
                {title}
              </Typography>
            )}
            {scope && (
              <Box sx={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                {scope}
              </Box>
            )}
          </Stack>
        )}
        {subtitle && (
          <Typography
            variant="body2"
            color="text.secondary"
            component="p"
            sx={(theme) => ({ marginTop: theme.spacing(0.25), marginBottom: 0 })}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && (
        <Box sx={{
          flexShrink: 0,
          minWidth: 0,
          width: { xs: '100%', sm: 'auto' },
          maxWidth: '100%',
          marginInlineStart: { xs: 0, sm: 'auto' },
          display: 'flex',
          justifyContent: { xs: 'center', sm: 'flex-end' },
        }}
        >
          {action}
        </Box>
      )}
    </Stack>
  );
}

PageHeader.propTypes = {
  title: PropTypes.node,
  subtitle: PropTypes.node,
  scope: PropTypes.node,
  action: PropTypes.node,
};
