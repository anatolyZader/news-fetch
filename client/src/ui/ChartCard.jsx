import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

const DENSITY = {
  comfortable: { px: 2, pt: 2, pb: 1 },
  dense:       { px: 1.5, pt: 1.5, pb: 0.75 },
};

export function ChartCard({
  title,
  subtitle,
  actions,
  density = 'comfortable',
  children,
}) {
  const padding = DENSITY[density] ?? DENSITY.comfortable;
  return (
    <Card
      sx={(theme) => ({
        paddingLeft: theme.spacing(padding.px),
        paddingRight: theme.spacing(padding.px),
        paddingTop: theme.spacing(padding.pt),
        paddingBottom: theme.spacing(padding.pb),
      })}
    >
      {(title || actions) && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={(theme) => ({ marginBottom: theme.spacing(1) })}
        >
          <Stack spacing={0.25}>
            {title && (
              <Typography variant="cardTitle" component="p">
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Stack>
          {actions && <Stack direction="row" spacing={0.5}>{actions}</Stack>}
        </Stack>
      )}
      {children}
    </Card>
  );
}

ChartCard.propTypes = {
  title: PropTypes.node,
  subtitle: PropTypes.node,
  actions: PropTypes.node,
  density: PropTypes.oneOf(['comfortable', 'dense']),
  children: PropTypes.node,
};
