import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

/**
 * Layout tier flags for mobile-only branching. Desktop (md+) behavior unchanged.
 */
export function useLayoutTier() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isCompact = useMediaQuery(theme.breakpoints.down('sm'));
  const isCoarsePointer = useMediaQuery('(pointer: coarse)');

  return { isMobile, isCompact, isCoarsePointer };
}
