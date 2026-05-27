import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

/**
 * Page-level header: title, subtitle, action slot.
 * Stateless. All styling sourced from theme tokens.
 */
export function PageHeader({ title, subtitle, action }) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="flex-start"
      useFlexGap
      flexWrap="wrap"
      spacing={1.2}
      sx={{ width: '100%' }}
    >
      <Box>
        {title && (
          <Typography variant="h2" component="h2">
            {title}
          </Typography>
        )}
        {subtitle && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={(theme) => ({ marginTop: theme.spacing(0.25) })}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && (
        <Box sx={{ flexShrink: 1, minWidth: 0, maxWidth: '100%', marginLeft: 'auto' }}>
          {action}
        </Box>
      )}
    </Stack>
  );
}

PageHeader.propTypes = {
  title: PropTypes.node,
  subtitle: PropTypes.node,
  action: PropTypes.node,
};
