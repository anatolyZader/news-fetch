import { useCallback, useEffect, useRef, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { ResizableFrame } from './ResizableFrame.jsx';

function getInitialSize(initialWidth, initialHeight) {
  const iw = initialWidth ?? 900;
  const ih = initialHeight ?? 640;
  if (typeof window === 'undefined') {
    return { w: iw, h: ih };
  }
  return {
    w: Math.min(iw, window.innerWidth - 32),
    h: Math.min(ih, Math.floor(window.innerHeight * 0.88)),
  };
}

export function ModalPanel({
  open,
  onClose,
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
    if (typeof window === 'undefined') {
      setSize({ w: next.width, h: next.height });
      return;
    }
    const maxW = window.innerWidth - 32;
    const maxH = Math.floor(window.innerHeight * 0.92);
    setSize({
      w: Math.max(400, Math.min(maxW, next.width)),
      h: Math.max(320, Math.min(maxH, next.height)),
    });
  }, []);

  const handleClose = useCallback((event, reason) => {
    if (disableBackdropClose && reason === 'backdropClick') return;
    onClose?.(event, reason);
  }, [disableBackdropClose, onClose]);

  useEffect(() => {
    if (!open || !modeless || !minimizeOnOutsideClick) return undefined;

    const handlePointerDown = (event) => {
      const paper = paperRef.current;
      const isInside = Boolean(paper && event.target instanceof Node && paper.contains(event.target));
      if (isInside) return;
      handleClose(event, 'outsidePointerDown');
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [handleClose, minimizeOnOutsideClick, modeless, open]);

  return (
    <Dialog
      open={Boolean(open)}
      onClose={handleClose}
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
      maxWidth={false}
      scroll="paper"
      hideBackdrop={modeless && !minimizeOnOutsideClick}
      disableAutoFocus={modeless}
      disableEnforceFocus={modeless}
      disableRestoreFocus={modeless}
      sx={(theme) => ({
        zIndex: zIndex ?? theme.zIndex.modal,
        pointerEvents: modeless && !minimizeOnOutsideClick ? 'none' : 'auto',
      })}
      slotProps={{
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
            borderRadius: theme.custom.radius.xl,
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
            backgroundColor: modeless && minimizeOnOutsideClick
              ? 'transparent'
              : theme.custom.surface.backdrop,
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
                    borderRadius: '50%',
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
          maxWidth={typeof window !== 'undefined' ? window.innerWidth - 32 : 2000}
          maxHeight={typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.92) : 2000}
          zIndex={3}
        />
      </Box>
    </Dialog>
  );
}
