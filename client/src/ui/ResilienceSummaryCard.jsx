import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

export function ResilienceSummaryCard({ statusText, statusColor, title }) {
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
      <Typography variant="h2" component="span">{title}</Typography>
    </Card>
  );
}

ResilienceSummaryCard.propTypes = {
  statusText: PropTypes.node.isRequired,
  statusColor: PropTypes.string,
  title: PropTypes.node.isRequired,
};
