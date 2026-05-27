import MuiButton from '@mui/material/Button';
import PropTypes from 'prop-types';

export function Button({
  variant = 'default',
  rounded = false,
  className = '',
  type = 'button',
  children,
  sx,
  ...props
}) {
  const muiVariant = variant === 'primary' ? 'contained' : 'outlined';
  const baseSx = (theme) => ({
    borderRadius: rounded ? theme.custom.radius.pill : theme.custom.radius.md,
    fontSize: theme.typography.body2.fontSize,
    fontWeight: variant === 'primary' ? 600 : 500,
    minWidth: 0,
    lineHeight: theme.typography.body2.lineHeight,
    paddingTop: theme.spacing(0.5),
    paddingBottom: theme.spacing(0.5),
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
    ...(variant === 'default'
      ? {
          color: theme.palette.text.secondary,
          borderColor: theme.palette.divider,
          backgroundColor: 'transparent',
          '&:hover': {
            color: theme.palette.text.primary,
            backgroundColor: 'transparent',
          },
        }
      : {}),
  });

  return (
    <MuiButton
      type={type}
      variant={muiVariant}
      disableElevation
      className={className}
      sx={Array.isArray(sx) ? [baseSx, ...sx] : [baseSx, sx ?? null]}
      {...props}
    >
      {children}
    </MuiButton>
  );
}

Button.propTypes = {
  variant: PropTypes.oneOf(['default', 'primary']),
  rounded: PropTypes.bool,
  className: PropTypes.string,
  type: PropTypes.string,
  children: PropTypes.node,
  sx: PropTypes.oneOfType([PropTypes.object, PropTypes.array, PropTypes.func]),
};
