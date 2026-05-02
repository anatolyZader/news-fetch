import Box from '@mui/material/Box';
import Card from '@mui/material/Card';

/**
 * Stateless, theme-driven grid table.
 *
 * Props:
 * - columns: Array<{ key: string; label: string; render?: (row) => ReactNode }>
 * - rows: Array<object>
 * - gridTemplateColumns: CSS grid-template-columns string
 * - textAlign: optional CSS text-align value for header and body cells
 *
 * Styling is sourced entirely from theme tokens (spacing, typography,
 * border, surface). No inline literals.
 */
export function GridTable({ columns, rows, gridTemplateColumns, textAlign = 'inherit' }) {
  return (
    <Card sx={{ overflow: 'hidden' }}>
      <Box
        sx={(theme) => ({
          display: 'grid',
          gridTemplateColumns,
          gap: theme.spacing(1),
          textAlign,
          paddingTop: theme.spacing(0.75),
          paddingBottom: theme.spacing(0.75),
          paddingLeft: theme.spacing(1.5),
          paddingRight: theme.spacing(1.5),
          background: theme.palette.background.default,
          fontSize: theme.typography.eyebrow.fontSize,
          fontWeight: theme.typography.eyebrow.fontWeight,
          textTransform: theme.typography.eyebrow.textTransform,
          letterSpacing: theme.typography.eyebrow.letterSpacing,
          color: theme.palette.text.secondary,
          borderBottom: theme.custom.border.hairline,
        })}
      >
        {columns.map((col) => (<span key={col.key}>{col.label}</span>))}
      </Box>
      {rows.map((row, idx) => (
        <Box
          key={idx}
          sx={(theme) => ({
            display: 'grid',
            gridTemplateColumns,
            gap: theme.spacing(1),
            textAlign,
            paddingTop: theme.spacing(0.75),
            paddingBottom: theme.spacing(0.75),
            paddingLeft: theme.spacing(1.5),
            paddingRight: theme.spacing(1.5),
            borderBottom: theme.custom.border.hairline,
            lineHeight: theme.typography.body2.lineHeight,
            fontSize: theme.typography.body2.fontSize,
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
