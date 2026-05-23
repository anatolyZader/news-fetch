import ButtonBase from '@mui/material/ButtonBase';

export function PrimaryTab({ active = false, compact = false, className = '', sx, children, ...props }) {
  return (
    <ButtonBase
      role="tab"
      aria-selected={active}
      className={className}
      sx={[
        (theme) => ({
          paddingTop: theme.spacing(compact ? 0.75 : 1),
          paddingBottom: theme.spacing(compact ? 0.75 : 1.25),
          paddingLeft: theme.spacing(1.5),
          paddingRight: theme.spacing(1.5),
          fontSize: compact ? theme.typography.body2.fontSize : theme.typography.sectionTitle.fontSize,
          fontWeight: 500,
          color: active ? theme.palette.text.primary : theme.palette.text.secondary,
          borderBottom: `2px solid ${active ? theme.palette.primary.main : 'transparent'}`,
          marginBottom: -1,
          cursor: 'pointer',
          background: 'none',
          textTransform: 'none',
          transition: theme.transitions.create(['color', 'border-color'], {
            duration: theme.transitions.duration.short,
          }),
          '&:hover': { color: theme.palette.text.primary, background: 'transparent' },
        }),
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
      {...props}
    >
      {children}
    </ButtonBase>
  );
}
