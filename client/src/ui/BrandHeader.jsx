import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const ALIGN_MAP = {
  start: { alignItems: 'flex-start', textAlign: 'left' },
  end:   { alignItems: 'flex-end',   textAlign: 'right' },
  center:{ alignItems: 'center',     textAlign: 'center' },
};

export function BrandHeader({ title, subtitle, align = 'start' }) {
  const alignSx = ALIGN_MAP[align] ?? ALIGN_MAP.start;
  return (
    <Stack
      spacing={0.25}
      sx={(theme) => ({
        ...alignSx,
        '[dir="rtl"] &': align === 'start'
          ? { alignItems: 'flex-end', textAlign: 'right' }
          : alignSx,
      })}
    >
      <Typography variant="h1" component="h1">
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </Stack>
  );
}
