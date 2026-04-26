import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';

export function ModalPanel({
  open,
  onClose,
  title,
  ariaLabel,
  width = 'min(900px, 96vw)',
  zIndex,
  headerRight = null,
  children,
}) {
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
            width,
            maxWidth: 'none',
            maxHeight: '88vh',
            margin: 0,
            marginTop: '5vh',
            marginBottom: theme.spacing(2),
            marginLeft: theme.spacing(2),
            marginRight: theme.spacing(2),
            borderRadius: theme.custom.radius.xl,
            border: theme.custom.border.hairline,
            boxShadow: theme.custom.elevation.modal,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignSelf: 'flex-start',
          }),
        },
        backdrop: {
          sx: (theme) => ({ backgroundColor: theme.custom.surface.backdrop }),
        },
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
        })}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>{title}</Box>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            {headerRight}
          </Stack>
        </Stack>
      </DialogTitle>
      {children}
    </Dialog>
  );
}
