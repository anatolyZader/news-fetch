import { useCallback, useEffect, useRef, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { ResizableFrame } from './ResizableFrame.jsx';
import { panelSectionRadius } from './panelChrome.js';
import PropTypes from 'prop-types';

const browserWindow = globalThis.window;

function getInitialSize(initialWidth = 900, initialHeight = 640) {
  if (browserWindow == null) {
    return { w: initialWidth, h: initialHeight };
  }
  return {
    w: Math.min(initialWidth, browserWindow.innerWidth - 32),
    h: Math.min(initialHeight, Math.floor(browserWindow.innerHeight * 0.88)),
  };
}

export function ModalPanel({
  open,
  onClose,
  onMinimize,
  title,
  ariaLabel,
  initialWidth,
  initialHeight,
  zIndex,
  headerRight = null,
  showCloseButton = false,
  closeLabel = 'Close',
  modeless = false,
  minimizeOnOutsideClick = false,
  disableBackdropClose = false,
  children,
}) {
  const [size, setSize] = useState(() => getInitialSize(initialWidth, initialHeight));
  const paperRef = useRef(null);

  const clampSize = useCallback((next) => {
    if (browserWindow == null) {
      setSize({ w: next.width, h: next.height });
      return;
    }
    const maxW = browserWindow.innerWidth - 32;
    const maxH = Math.floor(browserWindow.innerHeight * 0.92);
    setSize({
      w: Math.max(400, Math.min(maxW, next.width)),
      h: Math.max(320, Math.min(maxH, next.height)),
    });
  }, []);

  const modelessMinimize = modeless && minimizeOnOutsideClick;

  const requestMinimize = useCallback((event) => {
    if (onMinimize) {
      onMinimize(event);
      return;
    }
    onClose?.(event, 'outsidePointerDown');
  }, [onMinimize, onClose]);

  const handleClose = useCallback((event, reason) => {
    if (reason === 'backdropClick') {
      if (modelessMinimize) {
        requestMinimize(event);
        return;
      }
      if (disableBackdropClose) return;
    }
    if (modelessMinimize && reason === 'escapeKeyDown') {
      requestMinimize(event);
      return;
    }
    onClose?.(event, reason);
  }, [disableBackdropClose, modelessMinimize, onClose, requestMinimize]);

  useEffect(() => {
    if (!open || !modelessMinimize) return undefined;

    const handlePointerDown = (event) => {
      const paper = paperRef.current;
      const isInside = Boolean(paper && event.target instanceof Node && paper.contains(event.target));
      if (isInside) return;
      requestMinimize(event);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [modelessMinimize, open, requestMinimize]);

  return (
    <Dialog
      open={Boolean(open)}
      onClose={handleClose}
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
      maxWidth={false}
      scroll="paper"
      hideBackdrop={modeless}
      disableAutoFocus={modeless}
      disableEnforceFocus={modeless}
      disableRestoreFocus={modeless}
      sx={(theme) => ({
        zIndex: zIndex ?? theme.zIndex.modal,
      })}
      slotProps={{
        root: modeless
          ? { sx: { pointerEvents: 'none' } }
          : undefined,
        container: modeless
          ? { sx: { pointerEvents: 'none' } }
          : undefined,
        paper: {
          ref: paperRef,
          sx: (theme) => ({
            width: size.w,
            height: size.h,
            maxWidth: 'none',
            maxHeight: 'none',
            margin: 0,
            marginTop: '5vh',
            marginBottom: theme.spacing(2),
            marginLeft: 'auto',
            marginRight: 'auto',
            borderRadius: panelSectionRadius(theme),
            border: theme.custom.border.hairline,
            boxShadow: theme.custom.elevation.modal,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            alignSelf: 'flex-start',
            pointerEvents: 'auto',
          }),
        },
        backdrop: {
          sx: (theme) => ({
            backgroundColor: theme.custom.surface.backdrop,
          }),
        },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 auto',
          minHeight: 0,
          width: '100%',
          height: '100%',
        }}
      >
        <DialogTitle
          component="div"
          sx={(theme) => ({
            paddingTop: theme.spacing(1.5),
            paddingBottom: theme.spacing(1.5),
            paddingLeft: theme.spacing(2),
            paddingRight: theme.spacing(2),
            borderBottom: theme.custom.border.hairline,
            fontSize: theme.typography.h2.fontSize,
            fontWeight: theme.typography.h2.fontWeight,
            flex: '0 0 auto',
          })}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>{title}</Box>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              {headerRight}
              {showCloseButton && (
                <IconButton
                  type="button"
                  aria-label={closeLabel}
                  title={closeLabel}
                  size="small"
                  onClick={(event) => handleClose(event, 'closeButtonClick')}
                  sx={(theme) => ({
                    width: 32,
                    height: 32,
                    borderRadius: panelSectionRadius(theme),
                    border: theme.custom.border.hairline,
                    color: theme.palette.text.secondary,
                    backgroundColor: theme.palette.background.paper,
                    '&:hover': {
                      color: theme.palette.text.primary,
                      backgroundColor: theme.palette.action.hover,
                    },
                  })}
                >
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              )}
            </Stack>
          </Stack>
        </DialogTitle>
        <Box sx={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>{children}</Box>
        <ResizableFrame
          width={size.w}
          height={size.h}
          onSize={clampSize}
          minWidth={400}
          minHeight={320}
          maxWidth={browserWindow ? browserWindow.innerWidth - 32 : 2000}
          maxHeight={browserWindow ? Math.floor(browserWindow.innerHeight * 0.92) : 2000}
          zIndex={3}
        />
      </Box>
    </Dialog>
  );
}

ModalPanel.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onMinimize: PropTypes.func,
  title: PropTypes.node,
  ariaLabel: PropTypes.string,
  initialWidth: PropTypes.number,
  initialHeight: PropTypes.number,
  zIndex: PropTypes.number,
  headerRight: PropTypes.node,
  showCloseButton: PropTypes.bool,
  closeLabel: PropTypes.string,
  modeless: PropTypes.bool,
  minimizeOnOutsideClick: PropTypes.bool,
  disableBackdropClose: PropTypes.bool,
  children: PropTypes.node,
};
