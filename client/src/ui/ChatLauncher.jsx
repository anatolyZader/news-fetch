import Fab from '@mui/material/Fab';
import { alpha } from '@mui/material/styles';

export function ChatLauncher({
  open = false,
  onClick,
  openLabel = 'Close chat',
  closedLabel = 'Chat',
  position = 'bottom-right',
}) {
  const label = open ? openLabel : closedLabel;
  return (
    <Fab
      variant="extended"
      size="medium"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      sx={(theme) => ({
        position: 'fixed',
        zIndex: theme.zIndex.tooltip + 10,
        right: position === 'bottom-right' ? theme.spacing(3) : 'auto',
        left:  position === 'bottom-left'  ? theme.spacing(3) : 'auto',
        bottom: theme.spacing(3),
        paddingTop: theme.spacing(0.75),
        paddingBottom: theme.spacing(0.75),
        paddingLeft: theme.spacing(1.25),
        paddingRight: theme.spacing(1.25),
        borderRadius: theme.custom.radius.pill,
        border: theme.custom.border.hairline,
        background: theme.palette.background.paper,
        color: theme.palette.text.primary,
        fontWeight: theme.typography.button.fontWeight,
        boxShadow: theme.custom.elevation.hover,
        transition: theme.transitions.create(['transform', 'box-shadow', 'border-color'], {
          duration: theme.transitions.duration.short,
        }),
        '&:hover': {
          background: theme.palette.background.paper,
          boxShadow: theme.custom.elevation.cta,
          borderColor: alpha(theme.palette.primary.main, 0.4),
          transform: 'translateY(-1px)',
        },
        [theme.breakpoints.down('sm')]: {
          right: position === 'bottom-right' ? theme.spacing(2) : 'auto',
          left:  position === 'bottom-left'  ? theme.spacing(2) : 'auto',
          bottom: theme.spacing(2),
        },
      })}
    >
      {label}
    </Fab>
  );
}
