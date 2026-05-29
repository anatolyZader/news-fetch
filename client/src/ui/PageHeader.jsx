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
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      useFlexGap
      flexWrap="wrap"
      spacing={1.2}
      sx={{ width: '100%' }}
    >
      <Box sx={{ flex: action ? 1 : '0 1 auto', minWidth: 0 }}>
        {(title || scope) && (
          <Stack
            direction="row"
            alignItems="center"
            flexWrap="nowrap"
            useFlexGap
            spacing={1}
            sx={{ minWidth: 0 }}
          >
            {title && (
              <Typography
                variant="h2"
                component="h2"
                sx={{
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  margin: 0,
                }}
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
        <Box sx={{ flexShrink: 1, minWidth: 0, maxWidth: '100%', marginInlineStart: 'auto' }}>
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
