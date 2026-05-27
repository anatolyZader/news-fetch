import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';

const DENSITY = {
  comfortable: { px: 2, py: 1.5 },
  dense:       { px: 1.5, py: 1 },
};

export function KpiCard({
  label,
  value,
  helper,
  tone = 'default',
  density = 'comfortable',
  span,
}) {
  const padding = DENSITY[density] ?? DENSITY.comfortable;
  return (
    <Card
      elevation={0}
      sx={(theme) => ({
        paddingLeft: theme.spacing(padding.px),
        paddingRight: theme.spacing(padding.px),
        paddingTop: theme.spacing(padding.py),
        paddingBottom: theme.spacing(padding.py),
        flex: '1 1 140px',
        minWidth: theme.spacing(15),
        borderRadius: `${theme.custom.radius.section}px !important`,
        overflow: 'hidden',
        bgcolor: alpha(theme.palette.primary.main, 0.06),
        border: `1px solid ${alpha(theme.palette.primary.main, 0.28)}`,
        boxShadow: theme.custom.elevation.subtle,
        ...(span ? { gridColumn: `span ${span}` } : {}),
      })}
    >
      <Typography variant="eyebrow" component="p" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="kpiValue"
        component="p"
        sx={(theme) => ({
          marginTop: theme.spacing(0.5),
          color: tone === 'default' ? theme.palette.text.primary : tone,
          wordBreak: 'break-word',
        })}
      >
        {value}
      </Typography>
      {helper && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={(theme) => ({ display: 'block', marginTop: theme.spacing(0.5) })}
        >
          {helper}
        </Typography>
      )}
    </Card>
  );
}

KpiCard.propTypes = {
  label: PropTypes.node.isRequired,
  value: PropTypes.node.isRequired,
  helper: PropTypes.node,
  tone: PropTypes.string,
  density: PropTypes.oneOf(['comfortable', 'dense']),
  span: PropTypes.number,
};

export function KpiStrip({ children, minColumnWidth = 140, columns }) {
  return (
    <Box
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: columns
          ? `repeat(${columns}, minmax(0, 1fr))`
          : `repeat(auto-fit, minmax(${minColumnWidth}px, 1fr))`,
        gap: theme.spacing(1),
      })}
    >
      {children}
    </Box>
  );
}

KpiStrip.propTypes = {
  children: PropTypes.node,
  minColumnWidth: PropTypes.number,
  columns: PropTypes.number,
};
