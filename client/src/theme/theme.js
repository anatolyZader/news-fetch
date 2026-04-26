import { createTheme, alpha } from '@mui/material/styles';

const NEUTRAL = {
  ink:        '#1a1d2e',
  inkSubtle:  '#6b7280',
  inkSoft:    '#9ca3af',
  paper:      '#ffffff',
  background: '#f5f6fa',
  divider:    '#e2e5ed',
};

const BRAND = {
  primary:     '#2563eb',
  primaryDark: '#1d4ed8',
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
  blue: BRAND.primary,
  purple: '#7c3aed',
  yellow: '#f59e0b',
  teal: '#059669',
  amberDark: '#d97706',
};

const SOURCE = {
  field:   { main: BRAND.primary,    fg: BRAND.primary    },
  radio:   { main: SCORE.alert.main, fg: '#c2410c'        },
  naftali: { main: CHART.purple,     fg: '#6d28d9'        },
  press:   { main: SCORE.good.main,  fg: '#15803d'        },
  pbo:     { main: SCORE.moderate.main, fg: '#a16207'     },
};
for (const key of Object.keys(SOURCE)) {
  SOURCE[key].border = alpha(SOURCE[key].main, 0.25);
  SOURCE[key].bg     = alpha(SOURCE[key].main, 0.10);
}

const TYPOGRAPHY = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  h1:    { fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
  h2:    { fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.3 },
  h3:    { fontSize: '1rem',    fontWeight: 600, lineHeight: 1.3 },
  body1: { fontSize: '0.95rem', lineHeight: 1.6 },
  body2: { fontSize: '0.85rem', lineHeight: 1.55 },
  caption: { fontSize: '0.75rem', lineHeight: 1.4 },
  button: { textTransform: 'none', fontWeight: 600 },
  eyebrow: {
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    lineHeight: 1.2,
  },
  sectionTitle: {
    fontSize: '0.9rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    lineHeight: 1.2,
  },
  panelTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    lineHeight: 1.3,
  },
  kpiValue: { fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.2 },
  cardTitle: { fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.3 },
  pill: { fontSize: '0.78rem', fontWeight: 500, lineHeight: 1.2 },
  meta: { fontSize: '0.8rem', fontWeight: 500, lineHeight: 1.4 },
  display: { fontSize: '1.8rem', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.01em' },
  chatBody: { fontSize: '0.9rem', fontWeight: 400, lineHeight: 1.5 },
};

export function buildTheme(direction = 'ltr') {
  const base = createTheme({
    direction,
    spacing: 8,
    shape: { borderRadius: 8 },
    palette: {
      mode: 'light',
      primary:    { main: BRAND.primary, dark: BRAND.primaryDark, contrastText: NEUTRAL.paper },
      background: { default: NEUTRAL.background, paper: NEUTRAL.paper },
      text:       { primary: NEUTRAL.ink, secondary: NEUTRAL.inkSubtle },
      divider:    NEUTRAL.divider,
      score: SCORE,
      chart: CHART,
      source: SOURCE,
    },
    typography: TYPOGRAPHY,
    transitions: { duration: { shortest: 100, short: 150, standard: 200 } },
  });

  base.custom = {
    radius: {
      xs:   base.shape.borderRadius * 0.25,
      sm:   base.shape.borderRadius * 0.5,
      md:   base.shape.borderRadius,
      lg:   base.shape.borderRadius * 0.5,
      xl:   base.shape.borderRadius * 0.5,
      pill: 999,
    },
    elevation: {
      subtle:  `0 1px 0 ${alpha(NEUTRAL.ink, 0.04)}`,
      hover:   `0 8px 18px ${alpha(BRAND.primary, 0.10)}`,
      panel:   `0 18px 48px ${alpha(NEUTRAL.ink, 0.22)}`,
      modal:   `0 12px 50px ${alpha('#000000', 0.20)}`,
      cta:     `0 8px 16px ${alpha(BRAND.primary, 0.18)}`,
      chat:    `0 18px 50px ${alpha(NEUTRAL.ink, 0.14)}`,
    },
    surface: {
      muted:        base.palette.background.default,
      raised:       base.palette.background.paper,
      overlay:      alpha(NEUTRAL.ink, 0.06),
      backdrop:     alpha('#000000', 0.35),
      code:         alpha(NEUTRAL.ink, 0.05),
      bannerSubtle: alpha(BRAND.primary, 0.06),
      chatHeader:   alpha(base.palette.background.default, 0.9),
      errorBg:      alpha(SCORE.critical.main, 0.10),
      errorBorder:  alpha(SCORE.critical.main, 0.30),
      errorText:    SCORE.critical.main,
    },
    border: {
      hairline: `1px solid ${base.palette.divider}`,
      strong:   `2px solid ${base.palette.divider}`,
      focus:    `1px solid ${alpha(BRAND.primary, 0.55)}`,
    },
  };

  const { custom } = base;

  return createTheme(base, {
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            lineHeight: 1.6,
            backgroundColor: base.palette.background.default,
            color: base.palette.text.primary,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: custom.radius.md },
          sizeSmall: {
            paddingTop: base.spacing(0.5),
            paddingBottom: base.spacing(0.5),
            paddingLeft: base.spacing(1),
            paddingRight: base.spacing(1),
            fontSize: TYPOGRAPHY.body2.fontSize,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { borderRadius: custom.radius.lg } },
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
          rounded: { borderRadius: custom.radius.lg },
        },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: {
          root: { borderRadius: custom.radius.lg },
        },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: custom.radius.xl } },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: custom.radius.md, fontSize: TYPOGRAPHY.body2.fontSize },
        },
      },
      MuiAccordion: {
        defaultProps: { disableGutters: true, elevation: 0, square: true },
        styleOverrides: {
          root: {
            border: custom.border.hairline,
            borderRadius: `${custom.radius.md}px !important`,
            overflow: 'hidden',
            '&:before': { display: 'none' },
            '&.Mui-expanded': { margin: 0 },
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: {
            backgroundColor: custom.surface.muted,
            paddingLeft: base.spacing(2),
            paddingRight: base.spacing(2),
            minHeight: 0,
            '&.Mui-expanded': { backgroundColor: base.palette.background.paper, minHeight: 0 },
          },
          content: {
            marginTop: base.spacing(1.25),
            marginBottom: base.spacing(1.25),
            display: 'flex',
            alignItems: 'center',
            gap: base.spacing(1),
            '&.Mui-expanded': {
              marginTop: base.spacing(1.25),
              marginBottom: base.spacing(1.25),
            },
          },
        },
      },
      MuiAccordionDetails: {
        styleOverrides: {
          root: {
            padding: base.spacing(2),
            display: 'flex',
            flexDirection: 'column',
            gap: base.spacing(1.25),
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { backgroundColor: base.palette.primary.main },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontSize: TYPOGRAPHY.body2.fontSize,
            fontWeight: 500,
            paddingTop: base.spacing(0.5),
            paddingBottom: base.spacing(0.5),
            paddingLeft: base.spacing(1),
            paddingRight: base.spacing(1),
            color: base.palette.text.secondary,
            borderColor: base.palette.divider,
            '&.Mui-selected': {
              color: base.palette.primary.main,
              backgroundColor: 'transparent',
              fontWeight: 600,
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 700, fontSize: TYPOGRAPHY.caption.fontSize },
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
          paper: { borderRadius: custom.radius.md },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: { fontSize: TYPOGRAPHY.body2.fontSize },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: custom.radius.md },
        },
      },
    },
  });
}
