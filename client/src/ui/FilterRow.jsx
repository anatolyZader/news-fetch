import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

/**
 * Stateless single filter row: eyebrow label + flex-wrap children.
 * Pair with FilterPillGroup for the children.
 */
export function FilterRow({ label, children, labelMinWidth = 80, stackOnMobile = false }) {
  return (
    <Stack
      direction={stackOnMobile ? { xs: 'column', sm: 'row' } : 'row'}
      alignItems={stackOnMobile ? { xs: 'stretch', sm: 'flex-start' } : 'flex-start'}
      useFlexGap
      flexWrap="wrap"
      spacing={1}
      sx={{ width: '100%' }}
    >
      {label && (
        <Typography
          variant="eyebrow"
          color="text.secondary"
          sx={(theme) => ({
            paddingTop: theme.spacing(0.25),
            minWidth: stackOnMobile ? { xs: 'auto', sm: labelMinWidth } : labelMinWidth,
            flexShrink: 0,
          })}
        >
          {label}
        </Typography>
      )}
      <Box sx={{ flex: '1 1 auto', minWidth: 0, width: stackOnMobile ? { xs: '100%', sm: 'auto' } : 'auto' }}>
        {children}
      </Box>
    </Stack>
  );
}

FilterRow.propTypes = {
  label: PropTypes.node,
  children: PropTypes.node,
  labelMinWidth: PropTypes.number,
  stackOnMobile: PropTypes.bool,
};
