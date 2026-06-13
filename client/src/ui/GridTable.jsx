import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import PropTypes from 'prop-types';
import { mobileCardListSx } from './responsive/responsiveSx.js';

/**
 * Stateless, theme-driven grid table.
 * Below sm: card list (label/value rows). sm+: grid unchanged.
 */
export function GridTable({ columns, rows, gridTemplateColumns, textAlign = 'inherit' }) {
  const theme = useTheme();
  const isCardMode = useMediaQuery(theme.breakpoints.down('sm'));

  if (isCardMode) {
    return (
      <Box sx={mobileCardListSx}>
        {rows.map((row, idx) => (
          <Card
            key={row.id ?? row.key ?? `${idx}-${String(row[columns[0]?.key] ?? '')}`}
            variant="outlined"
            sx={(th) => ({
              padding: th.spacing(1.5),
              borderRadius: `${th.custom.radius.section}px`,
            })}
          >
            <Stack spacing={1}>
              {columns.map((col) => (
                <Box key={col.key}>
                  <Typography variant="caption" color="text.secondary" component="p" sx={{ margin: 0 }}>
                    {col.label}
                  </Typography>
                  <Box sx={{ wordBreak: 'break-word', textAlign, fontSize: theme.typography.body2.fontSize }}>
                    {col.render ? col.render(row) : (row[col.key] ?? '—')}
                  </Box>
                </Box>
              ))}
            </Stack>
          </Card>
        ))}
      </Box>
    );
  }

  return (
    <Card sx={{ overflow: 'hidden' }}>
      <Box
        sx={(th) => ({
          display: 'grid',
          gridTemplateColumns,
          gap: th.spacing(1),
          textAlign,
          paddingTop: th.spacing(0.75),
          paddingBottom: th.spacing(0.75),
          paddingLeft: th.spacing(1.5),
          paddingRight: th.spacing(1.5),
          background: th.palette.background.default,
          fontSize: th.typography.eyebrow.fontSize,
          fontWeight: th.typography.eyebrow.fontWeight,
          textTransform: th.typography.eyebrow.textTransform,
          letterSpacing: th.typography.eyebrow.letterSpacing,
          color: th.palette.text.secondary,
          borderBottom: th.custom.border.hairline,
        })}
      >
        {columns.map((col) => (<span key={col.key}>{col.label}</span>))}
      </Box>
      {rows.map((row, idx) => (
        <Box
          key={row.id ?? row.key ?? `${idx}-${String(row[columns[0]?.key] ?? '')}`}
          sx={(th) => ({
            display: 'grid',
            gridTemplateColumns,
            gap: th.spacing(1),
            textAlign,
            paddingTop: th.spacing(0.75),
            paddingBottom: th.spacing(0.75),
            paddingLeft: th.spacing(1.5),
            paddingRight: th.spacing(1.5),
            borderBottom: th.custom.border.hairline,
            lineHeight: th.typography.body2.lineHeight,
            fontSize: th.typography.body2.fontSize,
            '&:last-of-type': { borderBottom: 'none' },
          })}
        >
          {columns.map((col) => (
            <Box key={col.key} sx={{ wordBreak: 'break-word' }}>
              {col.render ? col.render(row) : (row[col.key] ?? '—')}
            </Box>
          ))}
        </Box>
      ))}
    </Card>
  );
}

GridTable.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    render: PropTypes.func,
  })).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  gridTemplateColumns: PropTypes.string.isRequired,
  textAlign: PropTypes.string,
};
