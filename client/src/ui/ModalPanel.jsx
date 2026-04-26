import { useCallback, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
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
  children,
}) {
  const [size, setSize] = useState(() => getInitialSize(initialWidth, initialHeight));

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

  return (
    <Dialog
      open={Boolean(open)}
      onClose={onClose}
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
      maxWidth={false}
      scroll="paper"
      sx={(theme) => ({ zIndex: zIndex ?? theme.zIndex.modal })}
      slotProps={{
        paper: {
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
          }),
        },
        backdrop: {
          sx: (theme) => ({ backgroundColor: theme.custom.surface.backdrop }),
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
