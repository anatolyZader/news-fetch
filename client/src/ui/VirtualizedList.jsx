import { useRef } from 'react';
import Box from '@mui/material/Box';
import { useVirtualizer } from '@tanstack/react-virtual';
import PropTypes from 'prop-types';

/**
 * Windowed list for long mobile feeds. Desktop callers should use plain .map().
 */
export function VirtualizedList({
  items,
  renderItem,
  estimateSize = 180,
  gap = 12,
  maxHeight = '70dvh',
}) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    gap,
  });

  return (
    <Box
      ref={parentRef}
      sx={{
        maxHeight,
        overflow: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <Box
        sx={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <Box
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {renderItem(items[virtualRow.index], virtualRow.index)}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

VirtualizedList.propTypes = {
  items: PropTypes.array.isRequired,
  renderItem: PropTypes.func.isRequired,
  estimateSize: PropTypes.number,
  gap: PropTypes.number,
  maxHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
