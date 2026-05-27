import Button from '@mui/material/Button';
import { alpha } from '@mui/material/styles';
import { panelHeaderButtonSx, panelSectionRadius } from './panelChrome.js';
import PropTypes from 'prop-types';

export function ChatLauncher({
  open = false,
  onClick,
  openLabel = 'Close chat',
  closedLabel = 'Chat',
  position = 'bottom-right',
}) {
  const label = open ? openLabel : closedLabel;
  return (
    <Button
      type="button"
      variant="outlined"
      size="small"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      sx={(theme) => ({
        ...panelHeaderButtonSx(theme),
        position: 'fixed',
        zIndex: theme.zIndex.tooltip + 10,
        right: position === 'bottom-right' ? theme.spacing(3) : 'auto',
        left:  position === 'bottom-left'  ? theme.spacing(3) : 'auto',
        bottom: theme.spacing(2),
        borderRadius: panelSectionRadius(theme),
        border: `1px solid ${alpha(theme.palette.primary.main, 0.35)}`,
        background: `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.primary.light, 0.55)} 100%)`,
        color: theme.palette.primary.dark,
        fontWeight: theme.typography.button.fontWeight,
        boxShadow: theme.custom.elevation.hover,
        transition: theme.transitions.create(['transform', 'box-shadow', 'border-color'], {
          duration: theme.transitions.duration.short,
        }),
        '&:hover': {
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.7)} 0%, ${alpha(theme.palette.secondary.light, 0.5)} 100%)`,
          boxShadow: theme.custom.elevation.cta,
          borderColor: theme.palette.primary.main,
          transform: 'translateY(-1px)',
        },
        [theme.breakpoints.down('sm')]: {
          right: position === 'bottom-right' ? theme.spacing(2) : 'auto',
          left:  position === 'bottom-left'  ? theme.spacing(2) : 'auto',
          bottom: theme.spacing(1.5),
        },
      })}
    >
      {label}
    </Button>
  );
}

ChatLauncher.propTypes = {
  open: PropTypes.bool,
  onClick: PropTypes.func,
  openLabel: PropTypes.string,
  closedLabel: PropTypes.string,
  position: PropTypes.oneOf(['bottom-right', 'bottom-left']),
};
