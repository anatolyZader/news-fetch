import Typography from '@mui/material/Typography';

const VARIANT_STYLES = {
  default: (theme) => ({
    color: theme.palette.text.secondary,
    paddingBottom: theme.spacing(0.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    marginTop: theme.spacing(0.25),
  }),
  plain: (theme) => ({
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.25),
  }),
};

export function SectionHeading({ children, variant = 'default', as = 'h3', sx }) {
  const variantSx = VARIANT_STYLES[variant] ?? VARIANT_STYLES.default;
  return (
    <Typography
      component={as}
      variant="sectionTitle"
      sx={(theme) => ({
        ...variantSx(theme),
        ...(typeof sx === 'function' ? sx(theme) : sx),
      })}
    >
      {children}
    </Typography>
  );
}
