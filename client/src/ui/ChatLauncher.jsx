import Fab from '@mui/material/Fab';
import Button from '@mui/material/Button';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import { panelHeaderButtonSx, panelSectionRadius } from './panelChrome.js';
import { safeAreaFixedSx } from './responsive/responsiveSx.js';
import PropTypes from 'prop-types';

/** Periodic attention flash (5s cycle) while the chat is closed. */
function attentionFlashSx(theme, open) {
  if (open) return {};
  const glow = alpha(theme.palette.primary.main, 0.55);
  return {
    '@keyframes chatLauncherFlash': {
      '0%, 100%': { transform: 'scale(1)', boxShadow: `0 0 0 0 ${glow}` },
      '4%': { transform: 'scale(1.08)', boxShadow: `0 0 0 6px ${alpha(glow, 0.4)}` },
      '8%': { transform: 'scale(1)', boxShadow: `0 0 0 12px ${alpha(glow, 0)}` },
    },
    animation: 'chatLauncherFlash 5s ease-out infinite',
    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  };
}

/** Airy gradient surface shared by both launcher variants. */
function launcherSurfaceSx(theme) {
  return {
    border: `1.5px solid ${alpha(theme.palette.primary.main, 0.45)}`,
    background: `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${alpha(theme.palette.primary.light, 0.55)} 100%)`,
    color: theme.palette.primary.dark,
    '&:hover': {
      background: `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.7)} 0%, ${alpha(theme.palette.secondary.light, 0.5)} 100%)`,
      borderColor: theme.palette.primary.main,
    },
  };
}

export function ChatLauncher({
  open = false,
  onClick,
  openLabel = 'Close chat',
  closedLabel = 'Chat',
  position = 'bottom-right',
  bottomInset = 0,
  ...rest
}) {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('sm'));
  const label = open ? openLabel : closedLabel;

  const horizontalInset = position === 'bottom-right'
    ? { right: theme.spacing(isCompact ? 2 : 3), left: 'auto' }
    : { left: theme.spacing(isCompact ? 2 : 3), right: 'auto' };

  const fixedSx = {
    position: 'fixed',
    // Below the modal layer so dialogs and their backdrops always cover the launcher.
    zIndex: theme.zIndex.modal - 1,
    ...horizontalInset,
    bottom: theme.spacing(2),
    ...safeAreaFixedSx(theme, { bottomInset, position }),
  };

  if (isCompact) {
    return (
      <Fab
        {...rest}
        aria-label={label}
        aria-expanded={open}
        onClick={onClick}
        sx={{
          ...fixedSx,
          width: 68,
          height: 68,
          ...launcherSurfaceSx(theme),
          boxShadow: `0 10px 28px ${alpha(theme.palette.primary.main, 0.35)}`,
          ...attentionFlashSx(theme, open),
        }}
      >
        <ChatOutlinedIcon sx={{ fontSize: 32 }} />
      </Fab>
    );
  }

  return (
    <Button
      {...rest}
      type="button"
      variant="outlined"
      size="large"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      startIcon={<ChatOutlinedIcon />}
      sx={(th) => ({
        ...panelHeaderButtonSx(th),
        ...fixedSx,
        borderRadius: panelSectionRadius(th),
        minHeight: th.spacing(6),
        px: 3,
        fontSize: th.typography.pxToRem(16),
        fontWeight: th.typography.fontWeightBold,
        boxShadow: th.custom.elevation.cta,
        transition: th.transitions.create(['transform', 'box-shadow', 'border-color'], {
          duration: th.transitions.duration.short,
        }),
        ...launcherSurfaceSx(th),
        ...attentionFlashSx(th, open),
        '&:hover': {
          ...launcherSurfaceSx(th)['&:hover'],
          boxShadow: th.custom.elevation.cta,
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
