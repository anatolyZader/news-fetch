import ButtonBase from '@mui/material/ButtonBase';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';

/**
 * Report nav row. Use inside a single bordered aside panel (`grouped`) so items
 * do not render as separate pill-shaped chips.
 */
export function SidebarItem({
  active = false,
  grouped = false,
  isLast = false,
  className = '',
  children,
  ...props
}) {
  return (
    <ButtonBase
      className={className}
      sx={(theme) => {
        const sectionPx = theme.custom.radius.section;
        return {
          width: '100%',
          textAlign: 'start',
          justifyContent: 'flex-start',
          paddingTop: theme.spacing(grouped ? 1.25 : 0.75),
          paddingBottom: theme.spacing(grouped ? 1.25 : 0.75),
          paddingLeft: theme.spacing(grouped ? 1.5 : 1),
          paddingRight: theme.spacing(grouped ? 1.5 : 1),
          borderRadius: grouped ? 0 : sectionPx,
          border: grouped
            ? 'none'
            : `1px solid ${active
              ? alpha(theme.palette.primary.main, 0.55)
              : theme.palette.divider}`,
          borderBottom: grouped && !isLast ? theme.custom.border.hairline : undefined,
          background: grouped
            ? (active ? alpha(theme.palette.primary.main, 0.08) : 'transparent')
            : (active
              ? theme.palette.background.paper
              : alpha(theme.palette.background.paper, 0.92)),
          color: theme.palette.text.primary,
          cursor: 'pointer',
          fontSize: theme.typography.body2.fontSize,
          fontWeight: active ? 600 : 500,
          lineHeight: theme.typography.body2.lineHeight,
          boxShadow: grouped ? 'none' : (active ? theme.custom.elevation.hover : theme.custom.elevation.subtle),
          borderInlineStart: grouped && active
            ? `3px solid ${theme.palette.primary.main}`
            : grouped
              ? '3px solid transparent'
              : undefined,
          transition: theme.transitions.create(['background', 'border-color'], {
            duration: theme.transitions.duration.short,
          }),
          '&:hover': grouped
            ? {
              background: alpha(theme.palette.primary.main, 0.06),
            }
            : {
              background: theme.palette.background.paper,
              borderColor: alpha(theme.palette.primary.main, 0.25),
            },
        };
      }}
      {...props}
    >
      {children}
    </ButtonBase>
  );
}

SidebarItem.propTypes = {
  active: PropTypes.bool,
  grouped: PropTypes.bool,
  isLast: PropTypes.bool,
  className: PropTypes.string,
  children: PropTypes.node,
};
