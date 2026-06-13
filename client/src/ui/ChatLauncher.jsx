import Fab from '@mui/material/Fab';
import Button from '@mui/material/Button';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import { panelHeaderButtonSx, panelSectionRadius } from './panelChrome.js';
import { safeAreaFixedSx } from './responsive/responsiveSx.js';
import PropTypes from 'prop-types';

export function ChatLauncher({
  open = false,
  onClick,
  openLabel = 'Close chat',
  closedLabel = 'Chat',
  position = 'bottom-right',
  bottomInset = 0,
}) {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('sm'));
  const label = open ? openLabel : closedLabel;

  const horizontalInset = position === 'bottom-right'
    ? { right: theme.spacing(isCompact ? 2 : 3), left: 'auto' }
    : { left: theme.spacing(isCompact ? 2 : 3), right: 'auto' };

  const fixedSx = {
    position: 'fixed',
    zIndex: theme.zIndex.tooltip + 10,
    ...horizontalInset,
    bottom: theme.spacing(2),
    ...safeAreaFixedSx(theme, { bottomInset, position }),
  };

  if (isCompact) {
    return (
      <Fab
        color="primary"
        aria-label={label}
        aria-expanded={open}
        onClick={onClick}
        sx={{
          ...fixedSx,
          width: 56,
          height: 56,
          boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.35)}`,
        }}
      >
        <ChatOutlinedIcon />
      </Fab>
    );
  }

  return (
    <Button
      type="button"
      variant="outlined"
      size="small"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      sx={(th) => ({
        ...panelHeaderButtonSx(th),
        ...fixedSx,
        borderRadius: panelSectionRadius(th),
        border: `1px solid ${alpha(th.palette.primary.main, 0.35)}`,
        background: `linear-gradient(135deg, ${th.palette.background.paper} 0%, ${alpha(th.palette.primary.light, 0.55)} 100%)`,
        color: th.palette.primary.dark,
        fontWeight: th.typography.button.fontWeight,
        boxShadow: th.custom.elevation.hover,
        transition: th.transitions.create(['transform', 'box-shadow', 'border-color'], {
          duration: th.transitions.duration.short,
        }),
        '&:hover': {
          background: `linear-gradient(135deg, ${alpha(th.palette.primary.light, 0.7)} 0%, ${alpha(th.palette.secondary.light, 0.5)} 100%)`,
          boxShadow: th.custom.elevation.cta,
          borderColor: th.palette.primary.main,
          transform: 'translateY(-1px)',
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
  bottomInset: PropTypes.number,
};
