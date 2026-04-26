import ButtonBase from '@mui/material/ButtonBase';
import { alpha } from '@mui/material/styles';

export function SidebarItem({ active = false, className = '', children, ...props }) {
  return (
    <ButtonBase
      className={className}
      sx={(theme) => ({
        width: '100%',
        textAlign: 'left',
        justifyContent: 'flex-start',
        paddingTop: theme.spacing(0.75),
        paddingBottom: theme.spacing(0.75),
        paddingLeft: theme.spacing(1),
        paddingRight: theme.spacing(1),
        borderRadius: theme.custom.radius.lg,
        border: `1px solid ${active
          ? alpha(theme.palette.primary.main, 0.55)
          : theme.palette.divider}`,
        background: active
          ? theme.palette.background.paper
          : alpha(theme.palette.background.paper, 0.92),
        color: theme.palette.text.primary,
        cursor: 'pointer',
        fontSize: theme.typography.body2.fontSize,
        fontWeight: 500,
        lineHeight: theme.typography.pill.lineHeight,
        boxShadow: active ? theme.custom.elevation.hover : theme.custom.elevation.subtle,
        transition: theme.transitions.create(['background', 'border-color', 'transform'], {
          duration: theme.transitions.duration.short,
        }),
        '&:hover': {
          background: theme.palette.background.paper,
          borderColor: alpha(theme.palette.primary.main, 0.25),
          transform: 'translateY(-1px)',
        },
      })}
      {...props}
    >
      {children}
    </ButtonBase>
  );
}
