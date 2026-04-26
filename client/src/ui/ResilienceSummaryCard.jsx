import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { StatusTag } from './StatusTag.jsx';

export function ResilienceSummaryCard({ statusText, statusColor, title, tagVariant = 'neutral' }) {
  return (
    <Card
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing(2),
        paddingTop: theme.spacing(2),
        paddingBottom: theme.spacing(2),
        paddingLeft: theme.spacing(2.5),
        paddingRight: theme.spacing(2.5),
      })}
    >
      <Typography variant="display" component="span" sx={{ color: statusColor }}>
        {statusText}
      </Typography>
      <Stack spacing={0.5}>
        <Typography variant="h2" component="span">{title}</Typography>
        <Box>
          <StatusTag variant={tagVariant}>{statusText}</StatusTag>
        </Box>
      </Stack>
    </Card>
  );
}
