import { alpha } from '@mui/material/styles';

const CARD_RADIUS = 16;

/** Page canvas on phone dashboard. */
export function mobileDashboardPageSx(theme) {
  return {
    [theme.breakpoints.down('sm')]: {
      backgroundColor: theme.palette.background.default,
    },
  };
}

/** Blue hero card (data source). */
export function mobileHeroCardSx(theme) {
  return {
    width: '100%',
    borderRadius: `${CARD_RADIUS}px`,
    overflow: 'hidden',
    background: `linear-gradient(145deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
    boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.28)}`,
    padding: theme.spacing(1.5),
  };
}

export function mobileHeroEyebrowSx(theme) {
  return {
    margin: 0,
    marginBottom: theme.spacing(1),
    paddingLeft: theme.spacing(0.5),
    color: alpha(theme.palette.common.white, 0.92),
    ...theme.typography.eyebrow,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };
}

export function mobileHeroPickerSx(theme) {
  return {
    width: '100%',
    justifyContent: 'space-between',
    textTransform: 'none',
    fontWeight: 600,
    fontSize: theme.typography.body2.fontSize,
    borderRadius: `${theme.custom.radius.section}px`,
    paddingTop: theme.spacing(1.25),
    paddingBottom: theme.spacing(1.25),
    paddingLeft: theme.spacing(1.5),
    paddingRight: theme.spacing(1.5),
    backgroundColor: theme.palette.common.white,
    color: theme.palette.text.primary,
    boxShadow: theme.custom.elevation.subtle,
    '&:hover': {
      backgroundColor: theme.palette.common.white,
      boxShadow: theme.custom.elevation.hover,
    },
  };
}

/** White surface card (daily assessment). */
export function mobileSurfaceCardSx(theme) {
  return {
    width: '100%',
    borderRadius: `${CARD_RADIUS}px`,
    border: theme.custom.border.hairline,
    backgroundColor: theme.palette.background.paper,
    boxShadow: theme.custom.elevation.subtle,
    padding: theme.spacing(2),
  };
}

/** Full-width pill toggle group. */
export function mobileSegmentedPillsSx(theme) {
  return {
    width: '100%',
    display: 'flex',
    '& .MuiToggleButtonGroup-grouped': {
      flex: 1,
      borderRadius: `${theme.custom.radius.section}px !important`,
      border: `1px solid ${theme.palette.divider} !important`,
      marginLeft: `${theme.spacing(0.5)} !important`,
      marginRight: 0,
      paddingTop: theme.spacing(0.875),
      paddingBottom: theme.spacing(0.875),
      textTransform: 'none',
      fontWeight: 600,
      fontSize: theme.typography.body2.fontSize,
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

/** Tappable field row (Latest, Report contents). */
export function mobileFieldRowSx(theme) {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.25),
    paddingTop: theme.spacing(1.25),
    paddingBottom: theme.spacing(1.25),
    paddingLeft: theme.spacing(1.5),
    paddingRight: theme.spacing(1.5),
    borderRadius: `${theme.custom.radius.section}px`,
    border: theme.custom.border.hairline,
    backgroundColor: theme.palette.background.paper,
    minHeight: theme.spacing(6),
    cursor: 'pointer',
    textAlign: 'start',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  };
}

/** Flat report body on phone (no extra shell). */
export function mobileFlatReportShellSx(theme) {
  return {
    [theme.breakpoints.down('sm')]: {
      border: 'none',
      borderRadius: 0,
      boxShadow: 'none',
      padding: 0,
      background: 'transparent',
      overflow: 'visible',
    },
  };
}
