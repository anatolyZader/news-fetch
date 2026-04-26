import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * Single inline KPI: eyebrow label above a kpiValue.
 * Use inside <SummaryStack> for the standard panel header row.
 */
export function MetricItem({ label, value }) {
  return (
    <Box>
      <Typography variant="eyebrow" component="p" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="kpiValue"
        component="p"
        sx={(theme) => ({ marginTop: theme.spacing(0.25) })}
      >
        {value}
      </Typography>
    </Box>
  );
}

/**
 * Horizontal stack of MetricItems with an optional trailing hairline.
 */
export function SummaryStack({ items, divider = true }) {
  return (
    <Stack
      direction="row"
      useFlexGap
      flexWrap="wrap"
      spacing={2}
      sx={(theme) => (divider ? {
        paddingBottom: theme.spacing(1),
        borderBottom: theme.custom.border.hairline,
      } : {})}
    >
      {items.map((item) => (
        <MetricItem key={item.label} label={item.label} value={item.value} />
      ))}
    </Stack>
  );
}
