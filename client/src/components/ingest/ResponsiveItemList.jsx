import Stack from '@mui/material/Stack';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import PropTypes from 'prop-types';
import { VirtualizedList } from '../../ui/VirtualizedList.jsx';

const VIRTUALIZE_THRESHOLD = 25;

/**
 * Renders a vertical list; virtualizes on mobile when item count exceeds threshold.
 */
export function ResponsiveItemList({
  items,
  renderItem,
  spacing = 1.5,
  estimateSize = 200,
  getItemKey = (item, index) => item?.id ?? index,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const shouldVirtualize = isMobile && items.length > VIRTUALIZE_THRESHOLD;

  if (shouldVirtualize) {
    return (
      <VirtualizedList
        items={items}
        estimateSize={estimateSize}
        gap={theme.spacing(spacing)}
        renderItem={(item, index) => (
          <Stack spacing={0} sx={{ pb: spacing }}>
            {renderItem(item, index)}
          </Stack>
        )}
      />
    );
  }

  return (
    <Stack spacing={spacing}>
      {items.map((item, index) => (
        <Stack key={getItemKey(item, index)} spacing={0}>
          {renderItem(item, index)}
        </Stack>
      ))}
    </Stack>
  );
}

ResponsiveItemList.propTypes = {
  items: PropTypes.array.isRequired,
  renderItem: PropTypes.func.isRequired,
  spacing: PropTypes.number,
  estimateSize: PropTypes.number,
  getItemKey: PropTypes.func,
};
