import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import PropTypes from 'prop-types';

export function FilterPill({
  active = false,
  onClick,
  children,
  size = 'small',
  tone = 'primary',
}) {
  return (
    <Chip
      clickable
      label={children}
      onClick={onClick}
      size={size}
      variant={active ? 'filled' : 'outlined'}
      color={active ? tone : 'default'}
      sx={(theme) => ({
        borderRadius: theme.custom.radius.pill,
        fontWeight: theme.typography.pill.fontWeight,
        fontSize: theme.typography.pill.fontSize,
        ...(active
          ? {}
          : {
              color: theme.palette.text.secondary,
              borderColor: theme.palette.divider,
              '&:hover': {
                color: theme.palette[tone]?.main ?? theme.palette.primary.main,
                borderColor: theme.palette[tone]?.main ?? theme.palette.primary.main,
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
