import { createTheme, alpha } from '@mui/material/styles';

/** Cool pastel palette — airy, modern, not warm/brown */
const PASTEL = {
  periwinkle:     '#8b9cf0',
  periwinkleDark: '#6f82e8',
  periwinkleLight:'#d8e0ff',
  sky:            '#b8d9f5',
  skyDeep:        '#7eb3e8',
  lilac:          '#c8b8f5',
  mint:           '#b8ebe0',
  mintDeep:       '#7ecfc0',
  canvas:         '#f4f7fc',
  mist:           '#eef3fa',
  cloud:          '#ffffff',
};

const NEUTRAL = {
  ink:        '#2f3648',
  inkSubtle:  '#6b7a94',
  inkSoft:    '#9aa8bc',
  paper:      PASTEL.cloud,
  background: PASTEL.canvas,
  divider:    '#e3eaf4',
};

const BRAND = {
  primary:      PASTEL.periwinkle,
  primaryDark:  PASTEL.periwinkleDark,
  primaryLight: PASTEL.periwinkleLight,
};

const SCORE = {
  critical: { main: '#dc2626' },
  weak:     { main: '#ea580c' },
  moderate: { main: '#ca8a04' },
  good:     { main: '#16a34a' },
  strong:   { main: '#0d9488' },
  alert:    { main: '#ea580c' },
  neutral:  { main: NEUTRAL.inkSubtle },
};
for (const key of Object.keys(SCORE)) {
  SCORE[key].soft = alpha(SCORE[key].main, 0.12);
}

const CHART = {
  gray: NEUTRAL.inkSubtle,
  grayLight: NEUTRAL.inkSoft,
  green: SCORE.good.main,
  amber: SCORE.moderate.main,
  orange: SCORE.alert.main,
  red: SCORE.critical.main,
  blue: PASTEL.skyDeep,
  purple: '#a78bfa',
  yellow: '#f59e0b',
  teal: '#059669',
  amberDark: '#d97706',
};

const SOURCE = {
  visits:  { main: BRAND.primary,       fg: BRAND.primaryDark },
  radio:   { main: SCORE.alert.main,    fg: '#c2410c' },
  naftali: { main: CHART.purple,        fg: '#7c3aed' },
  press:   { main: SCORE.good.main,     fg: '#15803d' },
  social:  { main: PASTEL.skyDeep,      fg: '#4f8fc4' },
  pbo:     { main: SCORE.moderate.main, fg: '#a16207' },
};
for (const key of Object.keys(SOURCE)) {
  SOURCE[key].border = alpha(SOURCE[key].main, 0.22);
  SOURCE[key].bg     = alpha(SOURCE[key].main, 0.08);
}

const TYPOGRAPHY = {
  fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  h1:    { fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
  h2:    { fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.35 },
  h3:    { fontSize: '1rem',    fontWeight: 600, lineHeight: 1.35 },
  body1: { fontSize: '0.95rem', lineHeight: 1.65 },
  body2: { fontSize: '0.85rem', lineHeight: 1.6 },
  caption: { fontSize: '0.75rem', lineHeight: 1.45 },
  button: { textTransform: 'none', fontWeight: 600 },
  eyebrow: {
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    lineHeight: 1.2,
  },
  sectionTitle: {
    fontSize: '0.9rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    lineHeight: 1.2,
  },
  panelTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    lineHeight: 1.3,
  },
  kpiValue: { fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.2 },
  cardTitle: { fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.3 },
  pill: { fontSize: '0.78rem', fontWeight: 500, lineHeight: 1.2 },
  meta: { fontSize: '0.8rem', fontWeight: 500, lineHeight: 1.4 },
  display: { fontSize: '1.8rem', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.01em' },
  chatBody: { fontSize: '0.9rem', fontWeight: 400, lineHeight: 1.55 },
};

/** Panels, alerts, cards — matches MuiAlert outlined. */
const SECTION_RADIUS_PX = 10;
/** Compact chips, nav rows, toggles — avoids pill look on short controls. */
const CONTROL_RADIUS_PX = 6;

const PAGE_GRADIENT = [
  `radial-gradient(1200px 480px at 8% -12%, ${alpha(PASTEL.lilac, 0.38)} 0%, transparent 60%)`,
  `radial-gradient(1000px 420px at 100% 0%, ${alpha(PASTEL.sky, 0.55)} 0%, transparent 58%)`,
  `radial-gradient(900px 360px at 50% 110%, ${alpha(PASTEL.mint, 0.32)} 0%, transparent 55%)`,
].join(', ');

export function buildTheme(direction = 'ltr') {
  const base = createTheme({
    direction,
    spacing: 8,
    shape: { borderRadius: SECTION_RADIUS_PX },
    palette: {
      mode: 'light',
      primary:    {
        main: BRAND.primary,
        light: BRAND.primaryLight,
        dark: BRAND.primaryDark,
        contrastText: NEUTRAL.paper,
      },
      secondary:  {
        main: PASTEL.mintDeep,
        light: PASTEL.mint,
        dark: '#5bb8a8',
        contrastText: NEUTRAL.paper,
      },
      background: { default: NEUTRAL.background, paper: NEUTRAL.paper },
      text:       { primary: NEUTRAL.ink, secondary: NEUTRAL.inkSubtle },
      divider:    NEUTRAL.divider,
      score: SCORE,
      chart: CHART,
      source: SOURCE,
    },
    typography: TYPOGRAPHY,
    transitions: { duration: { shortest: 100, short: 150, standard: 220 } },
  });

  base.custom = {
    pastel: PASTEL,
    radius: {
      section: SECTION_RADIUS_PX,
      control: CONTROL_RADIUS_PX,
      xs: SECTION_RADIUS_PX,
      sm: CONTROL_RADIUS_PX,
      md: SECTION_RADIUS_PX,
      lg: SECTION_RADIUS_PX,
      xl: SECTION_RADIUS_PX,
      pill: 999,
    },
    elevation: {
      subtle:  `0 1px 2px ${alpha(PASTEL.periwinkleDark, 0.06)}`,
      hover:   `0 12px 32px ${alpha(PASTEL.periwinkle, 0.12)}`,
      panel:   `0 20px 56px ${alpha(PASTEL.periwinkleDark, 0.1)}`,
      modal:   `0 18px 52px ${alpha(PASTEL.periwinkleDark, 0.14)}`,
      cta:     `0 8px 24px ${alpha(PASTEL.periwinkle, 0.2)}`,
      chat:    `0 20px 48px ${alpha(PASTEL.skyDeep, 0.14)}`,
    },
    surface: {
      muted:        base.palette.background.default,
      raised:       base.palette.background.paper,
      overlay:      alpha(PASTEL.periwinkle, 0.05),
      backdrop:     alpha(PASTEL.periwinkleDark, 0.12),
      tourScrim:    alpha(PASTEL.periwinkleDark, 0.55),
      code:         alpha(PASTEL.lilac, 0.14),
      bannerSubtle: alpha(PASTEL.sky, 0.4),
      blush:        PASTEL.mist,
      peachWash:    alpha(PASTEL.sky, 0.28),
      roseWash:     alpha(PASTEL.periwinkle, 0.14),
      sageWash:     alpha(PASTEL.mint, 0.22),
      chatHeader:   alpha(PASTEL.mist, 0.95),
      errorBg:      alpha(SCORE.critical.main, 0.08),
      errorBorder:  alpha(SCORE.critical.main, 0.28),
      errorText:    SCORE.critical.main,
    },
    border: {
      hairline: `1px solid ${base.palette.divider}`,
      strong:   `2px solid ${alpha(PASTEL.periwinkleLight, 0.9)}`,
      focus:    `1px solid ${alpha(BRAND.primary, 0.5)}`,
    },
  };

  const { custom } = base;

  return createTheme(base, {
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            lineHeight: 1.65,
            backgroundColor: base.palette.background.default,
            backgroundImage: PAGE_GRADIENT,
            backgroundAttachment: 'fixed',
            color: base.palette.text.primary,
            '@media (max-width: 899px)': {
              backgroundAttachment: 'scroll',
            },
          },
          '@media (prefers-reduced-motion: reduce)': {
            '*': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              transitionDuration: '0.01ms !important',
              scrollBehavior: 'auto !important',
            },
          },
        },
      },
      MuiButtonBase: {
        styleOverrides: {
          root: { borderRadius: `${custom.radius.section}px` },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: `${custom.radius.section}px` },
          sizeSmall: {
            borderRadius: `${custom.radius.section}px`,
            paddingTop: base.spacing(0.625),
            paddingBottom: base.spacing(0.625),
            paddingLeft: base.spacing(1.25),
            paddingRight: base.spacing(1.25),
            fontSize: TYPOGRAPHY.body2.fontSize,
          },
          outlined: {
            color: BRAND.primaryDark,
            borderColor: alpha(BRAND.primary, 0.4),
            backgroundColor: alpha(PASTEL.mist, 0.85),
            '&:hover': {
              color: BRAND.primaryDark,
              borderColor: BRAND.primary,
              backgroundColor: alpha(PASTEL.periwinkleLight, 0.65),
            },
          },
          outlinedPrimary: {
            color: BRAND.primaryDark,
            borderColor: alpha(BRAND.primary, 0.4),
            backgroundColor: alpha(PASTEL.mist, 0.85),
            '&:hover': {
              color: BRAND.primaryDark,
              borderColor: BRAND.primary,
              backgroundColor: alpha(PASTEL.periwinkleLight, 0.65),
            },
          },
          containedPrimary: {
            background: `linear-gradient(135deg, ${BRAND.primary} 0%, ${PASTEL.skyDeep} 100%)`,
            color: NEUTRAL.paper,
            boxShadow: custom.elevation.cta,
            '&:hover': {
              background: `linear-gradient(135deg, ${BRAND.primaryDark} 0%, ${PASTEL.periwinkle} 100%)`,
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { borderRadius: `${custom.radius.section}px` },
          sizeSmall: { borderRadius: `${custom.radius.section}px` },
        },
      },
      MuiFab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            boxShadow: custom.elevation.subtle,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { borderRadius: `${custom.radius.section}px` },
          rounded: { borderRadius: `${custom.radius.section}px` },
        },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: {
          root: {
            borderRadius: `${custom.radius.section}px`,
            borderColor: alpha(PASTEL.periwinkleLight, 0.85),
            backgroundColor: NEUTRAL.paper,
            backgroundImage: `linear-gradient(165deg, ${alpha(PASTEL.mist, 0.7)} 0%, ${NEUTRAL.paper} 48%)`,
            boxShadow: custom.elevation.subtle,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: `${custom.radius.section}px`,
            overflow: 'hidden',
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: `${custom.radius.section}px`, fontSize: TYPOGRAPHY.body2.fontSize },
          standardInfo: {
            backgroundColor: alpha(PASTEL.sky, 0.35),
            color: NEUTRAL.ink,
            '& .MuiAlert-icon': { color: PASTEL.skyDeep },
          },
        },
      },
      MuiAccordion: {
        defaultProps: { disableGutters: true, elevation: 0, square: true },
        styleOverrides: {
          root: {
            border: custom.border.hairline,
            borderRadius: `${custom.radius.section}px !important`,
            overflow: 'hidden',
            '&:before': { display: 'none' },
            '&.Mui-expanded': { margin: 0 },
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(PASTEL.mist, 0.6),
            paddingLeft: base.spacing(2),
            paddingRight: base.spacing(2),
            minHeight: 0,
            '&.Mui-expanded': {
              backgroundColor: alpha(PASTEL.periwinkleLight, 0.35),
              minHeight: 0,
            },
          },
          content: {
            marginTop: base.spacing(1.5),
            marginBottom: base.spacing(1.5),
            display: 'flex',
            alignItems: 'center',
            gap: base.spacing(1),
            '&.Mui-expanded': {
              marginTop: base.spacing(1.5),
              marginBottom: base.spacing(1.5),
            },
          },
        },
      },
      MuiAccordionDetails: {
        styleOverrides: {
          root: {
            padding: base.spacing(2.5),
            display: 'flex',
            flexDirection: 'column',
            gap: base.spacing(1.5),
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            background: `linear-gradient(90deg, ${BRAND.primary} 0%, ${PASTEL.mintDeep} 100%)`,
            height: 3,
            borderRadius: `${custom.radius.section}px`,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            '&.Mui-selected': { color: BRAND.primaryDark },
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontSize: TYPOGRAPHY.body2.fontSize,
            fontWeight: 500,
            paddingTop: base.spacing(0.625),
            paddingBottom: base.spacing(0.625),
            paddingLeft: base.spacing(1.25),
            paddingRight: base.spacing(1.25),
            color: base.palette.text.secondary,
            borderColor: base.palette.divider,
            borderRadius: `${custom.radius.section}px !important`,
            '&:hover': {
              backgroundColor: alpha(PASTEL.periwinkleLight, 0.45),
            },
            '&.Mui-selected': {
              color: NEUTRAL.paper,
              background: `linear-gradient(135deg, ${BRAND.primary} 0%, ${PASTEL.skyDeep} 100%)`,
              fontWeight: 700,
              borderColor: 'transparent',
              '&:hover': {
                color: NEUTRAL.paper,
                background: `linear-gradient(135deg, ${BRAND.primaryDark} 0%, ${PASTEL.periwinkle} 100%)`,
              },
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            fontSize: TYPOGRAPHY.caption.fontSize,
            borderRadius: `${custom.radius.section}px`,
          },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { borderRadius: `${custom.radius.section}px` },
          grouped: {
            '&:not(:first-of-type)': { borderRadius: `${custom.radius.section}px` },
            '&:first-of-type': { borderRadius: `${custom.radius.section}px` },
            '&:last-of-type': { borderRadius: `${custom.radius.section}px` },
          },
        },
      },
      MuiSnackbar: {
        styleOverrides: {
          root: { borderRadius: `${custom.radius.section}px` },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: { borderRadius: `${custom.radius.section}px` },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: { fontWeight: 600 },
          root: { fontSize: TYPOGRAPHY.body2.fontSize },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: `${custom.radius.section}px`,
            border: custom.border.hairline,
            boxShadow: custom.elevation.hover,
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            borderRadius: `${custom.radius.section}px`,
            border: custom.border.hairline,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: { fontSize: TYPOGRAPHY.body2.fontSize },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: `${custom.radius.section}px`,
            backgroundColor: alpha(PASTEL.mist, 0.5),
          },
          notchedOutline: {
            borderRadius: `${custom.radius.section}px`,
          },
        },
      },
    },
  });
}
