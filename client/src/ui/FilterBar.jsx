import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

/**
 * Card-bordered container for one or more <FilterRow> blocks.
 * Optional `footer` is rendered below a hairline divider; pass
 * { message, onClear, clearLabel } to render the standard
 * "Showing N of M" + clear button.
 */
export function FilterBar({ children, footer, centered = false }) {
  return (
    <Card sx={(theme) => ({
      paddingTop: theme.spacing(1.5),
      paddingBottom: theme.spacing(1.5),
      paddingLeft: theme.spacing(2),
      paddingRight: theme.spacing(2),
    })}>
      <Stack
        spacing={1}
        alignItems={centered ? 'center' : 'stretch'}
        sx={centered ? { width: '100%' } : undefined}
      >
        {children}
        {footer && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.2}
            sx={(theme) => ({
              paddingTop: theme.spacing(0.25),
              borderTop: theme.custom.border.hairline,
            })}
          >
            <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 500 }}>
              {footer.message}
            </Typography>
            {footer.onClear && (
              <Button
                size="small"
                variant="text"
                onClick={footer.onClear}
                sx={{ textDecoration: 'underline' }}
              >
                {footer.clearLabel}
              </Button>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
