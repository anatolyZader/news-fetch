import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';

export function FilterPill({
  active = false,
  onClick,
  children,
  size = 'small',
  tone = 'primary',
}) {
  return (
    <Chip
      clickable
      label={children}
      onClick={onClick}
      size={size}
      variant={active ? 'filled' : 'outlined'}
      color={active ? tone : 'default'}
      sx={(theme) => ({
        borderRadius: theme.custom.radius.pill,
        fontWeight: theme.typography.pill.fontWeight,
        fontSize: theme.typography.pill.fontSize,
        ...(active
          ? {}
          : {
              color: theme.palette.text.secondary,
              borderColor: theme.palette.divider,
              '&:hover': {
                color: theme.palette[tone]?.main ?? theme.palette.primary.main,
                borderColor: theme.palette[tone]?.main ?? theme.palette.primary.main,
              },
            }),
      })}
    />
  );
}

export function FilterPillGroup({ children, label, spacing = 0.5, wrap = true }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      useFlexGap
      flexWrap={wrap ? 'wrap' : 'nowrap'}
      spacing={spacing}
      role="group"
      aria-label={label}
    >
      {children}
    </Stack>
  );
}
