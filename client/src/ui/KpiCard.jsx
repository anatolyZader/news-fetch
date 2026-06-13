import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';

const DENSITY = {
  comfortable: { px: 2, py: 1.5 },
  dense:       { px: 1.5, py: 1 },
};

function resolveSpan(span, theme) {
  if (span == null) return {};
  if (typeof span === 'number') return { gridColumn: `span ${span}` };
  const xs = span.xs ?? 1;
  const md = span.md ?? span.xs ?? 1;
  return {
    gridColumn: `span ${md}`,
    [theme.breakpoints.down('md')]: { gridColumn: `span ${span.sm ?? xs}` },
    [theme.breakpoints.down('sm')]: { gridColumn: `span ${xs}` },
  };
}

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
        ...resolveSpan(span, theme),
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
  span: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.shape({
      xs: PropTypes.number,
      sm: PropTypes.number,
      md: PropTypes.number,
    }),
  ]),
};

function resolveColumns(columns, theme, minColumnWidth) {
  if (columns == null) {
    return `repeat(auto-fit, minmax(${minColumnWidth}px, 1fr))`;
  }
  if (typeof columns === 'number') {
    return `repeat(${columns}, minmax(0, 1fr))`;
  }
  const xs = columns.xs ?? 2;
  const sm = columns.sm ?? xs;
  const md = columns.md ?? sm;
  return {
    gridTemplateColumns: `repeat(${md}, minmax(0, 1fr))`,
    [theme.breakpoints.down('md')]: {
      gridTemplateColumns: `repeat(${sm}, minmax(0, 1fr))`,
    },
    [theme.breakpoints.down('sm')]: {
      gridTemplateColumns: `repeat(${xs}, minmax(0, 1fr))`,
    },
  };
}

export function KpiStrip({ children, minColumnWidth = 140, columns }) {
  return (
    <Box
      sx={(theme) => {
        const cols = resolveColumns(columns, theme, minColumnWidth);
        if (typeof cols === 'string') {
          return {
            display: 'grid',
            gridTemplateColumns: cols,
            gap: theme.spacing(1),
          };
        }
        return {
          display: 'grid',
          gap: theme.spacing(1),
          ...cols,
        };
      }}
    >
      {children}
    </Box>
  );
}

KpiStrip.propTypes = {
  children: PropTypes.node,
  minColumnWidth: PropTypes.number,
  columns: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.shape({
      xs: PropTypes.number,
      sm: PropTypes.number,
      md: PropTypes.number,
    }),
  ]),
};
