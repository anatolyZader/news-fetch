/** App-wide 10px corner radius (alerts, cards, panels, buttons). */

export function panelSectionRadius(theme) {
  return `${theme.custom.radius.section}px`;
}

/** @deprecated Use panelSectionRadius — same value, shared name. */
export const appSectionRadius = panelSectionRadius;

export function panelHeaderButtonSx(theme) {
  return {
    minHeight: theme.spacing(4.5),
    borderRadius: panelSectionRadius(theme),
  };
}

export function panelInsetBoxSx(theme) {
  return {
    border: theme.custom.border.hairline,
    borderRadius: panelSectionRadius(theme),
  };
}

/** National / North scope pills — inline row with visible gaps between buttons. */
export function reportScopePillsSx(theme) {
  return {
    flexShrink: 0,
    '& .MuiToggleButtonGroup-grouped': {
      borderRadius: `${theme.custom.radius.section}px !important`,
      border: theme.custom.border.hairline,
      marginLeft: `${theme.spacing(0.75)} !important`,
      marginRight: '0 !important',
      textTransform: 'none',
      '&:first-of-type': {
        marginLeft: '0 !important',
      },
    },
    '& .MuiToggleButton-root.Mui-selected': {
      backgroundColor: theme.palette.primary.main,
      color: theme.palette.primary.contrastText,
      borderColor: `${theme.palette.primary.main} !important`,
      '&:hover': {
        backgroundColor: theme.palette.primary.dark,
      },
    },
  };
}

/** Even grid of date (or date-like) toggle chips — left-to-right, row by row. */
export function dateToggleGridSx(theme, { minColumnWidth = 108 } = {}) {
  return {
    display: 'grid',
    width: '100%',
    gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
    gap: theme.spacing(0.75),
    '& .MuiToggleButtonGroup-grouped': {
      margin: 0,
      border: theme.custom.border.hairline,
      borderRadius: `${theme.custom.radius.section}px !important`,
    },
    '& .MuiToggleButton-root': {
      width: '100%',
      justifyContent: 'center',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
    },
  };
}
