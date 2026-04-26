import Card from '@mui/material/Card';

/**
 * Boxed detail panel: vertical flex Card with consistent padding/gap.
 * Use as the container for "selected item" deep-dives that combine a
 * SummaryStack, charts, and tables.
 */
export function DetailPanel({ children }) {
  return (
    <Card sx={(theme) => ({
      padding: theme.spacing(1.5),
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1),
    })}>
      {children}
    </Card>
  );
}
