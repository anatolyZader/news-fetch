import ButtonBase from '@mui/material/ButtonBase';
import PropTypes from 'prop-types';

function mergeSx(sx) {
  if (sx == null) return [];
  return Array.isArray(sx) ? sx : [sx];
}

export const PrimaryTab = (props) => {
  const {
    active = false,
    compact = false,
    className = '',
    sx,
    children,
    ...rest
  } = props;
  return (
    <ButtonBase
      role="tab"
      aria-selected={active}
      className={className}
      sx={[
        (theme) => ({
          paddingTop: theme.spacing(compact ? 0.75 : 1),
          paddingBottom: theme.spacing(compact ? 0.75 : 1.25),
          paddingLeft: theme.spacing(1.5),
          paddingRight: theme.spacing(1.5),
          fontSize: compact ? theme.typography.body2.fontSize : theme.typography.sectionTitle.fontSize,
          fontWeight: 500,
          color: active ? theme.palette.primary.dark : theme.palette.text.secondary,
          borderBottom: active
            ? `2px solid ${theme.palette.primary.main}`
            : '2px solid transparent',
          backgroundColor: active ? theme.custom.surface.roseWash : 'transparent',
          borderRadius: `${theme.custom.radius.section}px ${theme.custom.radius.section}px 0 0`,
          marginBottom: -1,
          cursor: 'pointer',
          background: 'none',
          textTransform: 'none',
          transition: theme.transitions.create(['color', 'border-color'], {
            duration: theme.transitions.duration.short,
          }),
          '&:hover': {
            color: theme.palette.primary.dark,
            backgroundColor: theme.custom.surface.roseWash,
          },
        }),
        ...mergeSx(sx),
      ]}
      {...rest}
    >
      {children}
    </ButtonBase>
  );
};

PrimaryTab.propTypes = {
  active: PropTypes.bool,
  compact: PropTypes.bool,
  className: PropTypes.string,
  sx: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.func]),
  children: PropTypes.node,
};
