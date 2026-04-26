import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/**
 * Stateless single filter row: eyebrow label + flex-wrap children.
 * Pair with FilterPillGroup for the children.
 */
export function FilterRow({ label, children, labelMinWidth = 80 }) {
  return (
    <Stack direction="row" alignItems="flex-start" useFlexGap flexWrap="wrap" spacing={1}>
      {label && (
        <Typography
          variant="eyebrow"
          color="text.secondary"
          sx={(theme) => ({
            paddingTop: theme.spacing(0.25),
            minWidth: labelMinWidth,
            flexShrink: 0,
          })}
        >
          {label}
        </Typography>
      )}
      {children}
    </Stack>
  );
}
