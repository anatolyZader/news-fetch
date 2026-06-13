/** Scrollable horizontal tab row — apply only below md. */
export function scrollableTabRowSx(theme) {
  return {
    [theme.breakpoints.down('md')]: {
      overflowX: 'auto',
      flexWrap: 'nowrap',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none',
      scrollSnapType: 'x mandatory',
      msOverflowStyle: 'none',
      '&::-webkit-scrollbar': { display: 'none' },
      '& > *': {
        scrollSnapAlign: 'start',
        flex: '0 0 auto',
      },
    },
  };
}

/** Right-edge fade hint for horizontally scrollable rows. */
export function scrollFadeEdgeSx(theme) {
  return {
    position: 'relative',
    '&::after': {
      content: '""',
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: theme.spacing(3),
      pointerEvents: 'none',
      background: `linear-gradient(to left, ${theme.palette.background.paper}, transparent)`,
    },
  };
}

/** Fixed-position elements respecting safe-area and optional keyboard inset. */
export function safeAreaFixedSx(theme, { bottomInset = 0, position = 'bottom-right' } = {}) {
  const baseBottom = `calc(${theme.spacing(2)} + env(safe-area-inset-bottom, 0px) + ${bottomInset}px)`;
  return {
    [theme.breakpoints.down('md')]: {
      ...(position === 'bottom-right' || position === 'bottom-left'
        ? { bottom: baseBottom }
        : {}),
      ...(position === 'bottom-right'
        ? { right: `calc(${theme.spacing(2)} + env(safe-area-inset-right, 0px))` }
        : {}),
      ...(position === 'bottom-left'
        ? { left: `calc(${theme.spacing(2)} + env(safe-area-inset-left, 0px))` }
        : {}),
    },
  };
}

/** Sticky first column for horizontally scrollable tables (sm–md). */
export function stickyTableFirstColSx(theme) {
  return {
    [theme.breakpoints.between('sm', 'md')]: {
      '& .MuiTableCell:first-of-type': {
        position: 'sticky',
        left: 0,
        zIndex: 1,
        backgroundColor: theme.palette.background.paper,
        boxShadow: `2px 0 4px ${theme.palette.divider}`,
      },
    },
  };
}

/** Card list spacing for mobile table fallbacks. */
export function mobileCardListSx(theme) {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  };
}

/** Main page column gap — tighter below md to avoid cluttered mobile stacks. */
export function mobilePageGapSx(theme, desktopGap = 5) {
  return {
    gap: theme.spacing(desktopGap),
    [theme.breakpoints.down('md')]: {
      gap: theme.spacing(2),
    },
    [theme.breakpoints.down('sm')]: {
      gap: theme.spacing(1.5),
    },
  };
}

/** Chat actions visible on touch / compact; hover-reveal on fine pointer. */
export function chatActionsVisibilitySx(theme) {
  return {
    opacity: 1,
    pointerEvents: 'auto',
    '@media (hover: hover) and (pointer: fine)': {
      opacity: 0,
      pointerEvents: 'none',
    },
    [theme.breakpoints.down('sm')]: {
      opacity: 1,
      pointerEvents: 'auto',
    },
    '@media (pointer: coarse)': {
      opacity: 1,
      pointerEvents: 'auto',
    },
  };
}

/** Parent row hover reveal for fine pointer only. */
export function chatRowHoverRevealSx() {
  return {
    '@media (hover: hover) and (pointer: fine)': {
      '&:hover .chat-actions': { opacity: 1, pointerEvents: 'auto' },
    },
  };
}
