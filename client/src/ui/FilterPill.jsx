import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';
import { panelHeaderButtonSx, panelSectionRadius } from './panelChrome.js';

export function FilterPill({
  active = false,
  onClick,
  children,
  size = 'small',
  tone = 'primary',
}) {
  const toneMain = (theme) => theme.palette[tone]?.main ?? theme.palette.primary.main;
  const toneDark = (theme) => theme.palette[tone]?.dark ?? theme.palette.primary.dark;

  return (
    <Chip
      clickable
      label={children}
      onClick={onClick}
      size={size}
      variant={active ? 'filled' : 'outlined'}
      color="default"
      sx={(theme) => ({
        ...panelHeaderButtonSx(theme),
        borderRadius: `${panelSectionRadius(theme)} !important`,
        fontWeight: active ? 600 : theme.typography.pill.fontWeight,
        fontSize: theme.typography.pill.fontSize,
        ...(active
          ? {
            color: theme.palette.primary.contrastText,
            backgroundColor: toneMain(theme),
            borderColor: 'transparent',
            boxShadow: theme.custom.elevation.subtle,
            '& .MuiChip-label': {
              color: 'inherit',
              paddingLeft: theme.spacing(1.25),
              paddingRight: theme.spacing(1.25),
            },
            '&:hover': {
              color: theme.palette.primary.contrastText,
              backgroundColor: toneDark(theme),
            },
          }
          : {
            color: theme.palette.text.secondary,
            backgroundColor: theme.palette.background.paper,
            borderColor: theme.palette.divider,
            '& .MuiChip-label': {
              color: 'inherit',
              paddingLeft: theme.spacing(1.25),
              paddingRight: theme.spacing(1.25),
            },
            '&:hover': {
              color: toneMain(theme),
              borderColor: alpha(toneMain(theme), 0.45),
              backgroundColor: alpha(toneMain(theme), 0.06),
            },
          }),
      })}
    />
  );
}

FilterPill.propTypes = {
  active: PropTypes.bool,
  onClick: PropTypes.func,
  children: PropTypes.node,
  size: PropTypes.string,
  tone: PropTypes.string,
};

export function FilterPillGroup({ children, label, spacing = 0.5, wrap = true, center = false }) {
  if (center) {
    return (
      <Box
        role="group"
        aria-label={label}
        sx={(theme) => ({
          display: 'flex',
          flexDirection: 'row',
          flexWrap: wrap ? 'wrap' : 'nowrap',
          justifyContent: 'center',
          alignItems: 'center',
          alignSelf: 'stretch',
          gap: theme.spacing(spacing),
          width: '100%',
          maxWidth: '100%',
          '& .MuiChip-root': { flexShrink: 0 },
          '& .MuiChip-label': { whiteSpace: 'nowrap' },
        })}
      >
        {children}
      </Box>
    );
  }

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="flex-start"
      useFlexGap
      flexWrap={wrap ? 'wrap' : 'nowrap'}
      spacing={spacing}
      role="group"
      aria-label={label}
      sx={{
        minWidth: 0,
        maxWidth: '100%',
        flex: '1 1 0',
        overflow: 'hidden',
        '& .MuiChip-root': { flexShrink: 0 },
        '& .MuiChip-label': { whiteSpace: 'nowrap' },
      }}
    >
      {children}
    </Stack>
  );
}

FilterPillGroup.propTypes = {
  children: PropTypes.node,
  label: PropTypes.string,
  spacing: PropTypes.number,
  wrap: PropTypes.bool,
  center: PropTypes.bool,
};
