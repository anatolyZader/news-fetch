import Box from '@mui/material/Box';
import PropTypes from 'prop-types';

/**
 * Auto-fit grid container for chart cards (or any equally-sized cards).
 * Stateless; spacing via theme.
 */
export function ChartGrid({ children, minColumnWidth = 300, gap = 1 }) {
  return (
    <Box
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minColumnWidth}px, 1fr))`,
        gap: theme.spacing(gap),
      })}
    >
      {children}
    </Box>
  );
}

ChartGrid.propTypes = {
  children: PropTypes.node,
  minColumnWidth: PropTypes.number,
  gap: PropTypes.number,
};
