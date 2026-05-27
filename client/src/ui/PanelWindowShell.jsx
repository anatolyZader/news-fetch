import { useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { panelSectionRadius } from './panelChrome.js';
import PropTypes from 'prop-types';

const APP_TITLE_SUFFIX = 'Vibes Witch';

export function PanelWindowShell({
  title,
  ariaLabel,
  onClose,
  closeLabel = 'Close',
  headerRight = null,
  children,
}) {
  useEffect(() => {
    const label = typeof title === 'string' ? title : ariaLabel;
    if (!label) return undefined;
    const previous = document.title;
    document.title = `${label} · ${APP_TITLE_SUFFIX}`;
    return () => {
      document.title = previous;
    };
  }, [title, ariaLabel]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.default',
      }}
    >
      <Box
        component="header"
        role="banner"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
        sx={(theme) => ({
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing(1),
          paddingTop: theme.spacing(1.5),
          paddingBottom: theme.spacing(1.5),
          paddingLeft: theme.spacing(2),
          paddingRight: theme.spacing(2),
          borderBottom: theme.custom.border.hairline,
          backgroundColor: theme.palette.background.paper,
          fontSize: theme.typography.h2.fontSize,
          fontWeight: theme.typography.h2.fontWeight,
        })}
      >
        <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>{title}</Box>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
          {headerRight}
          {onClose && (
            <IconButton
              type="button"
              aria-label={closeLabel}
              title={closeLabel}
              size="small"
              onClick={onClose}
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
      </Box>
      <Box component="main" sx={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
        {children}
      </Box>
    </Box>
  );
}

PanelWindowShell.propTypes = {
  title: PropTypes.node,
  ariaLabel: PropTypes.string,
  onClose: PropTypes.func,
  closeLabel: PropTypes.string,
  headerRight: PropTypes.node,
  children: PropTypes.node,
};
