import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

export function ResilienceSummaryCard({ statusText, statusColor, title, flat = false }) {
  const sx = (theme) => ({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
    paddingLeft: theme.spacing(2.5),
    paddingRight: theme.spacing(2.5),
    ...(flat
      ? {
        borderRadius: 0,
        border: 'none',
        borderBottom: theme.custom.border.hairline,
        boxShadow: 'none',
        backgroundImage: 'none',
        backgroundColor: 'transparent',
      }
      : null),
  });

  if (flat) {
    return (
      <Box sx={sx}>
        <Typography variant="display" component="span" sx={{ color: statusColor }}>
          {statusText}
        </Typography>
        <Typography variant="h2" component="span">{title}</Typography>
      </Box>
    );
  }

  return (
    <Card sx={sx}>
      <Typography variant="display" component="span" sx={{ color: statusColor }}>
        {statusText}
      </Typography>
      <Typography variant="h2" component="span">{title}</Typography>
    </Card>
  );
}

ResilienceSummaryCard.propTypes = {
  statusText: PropTypes.node.isRequired,
  statusColor: PropTypes.string,
  title: PropTypes.node.isRequired,
  flat: PropTypes.bool,
};
