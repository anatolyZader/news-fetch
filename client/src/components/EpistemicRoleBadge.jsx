import Box from '@mui/material/Box';
import PropTypes from 'prop-types';

const ROLE_COLORS = {
  scored: 'success',
  investigation_only: 'info',
  context_only: 'warning',
  quarantined: 'error',
};

/**
 * @param {{ user_epistemic_role?: string }} props
 */
export function EpistemicRoleBadge({ role, t }) {
  const r = String(role ?? '').trim();
  if (!r) return null;
  const color = ROLE_COLORS[r] ?? 'default';
  const key = `report.epistemicRole.${r}`;
  const label = t(key);
  const text = label === key ? r : label;
  return (
    <Box
      component="span"
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: theme.typography.eyebrow.fontSize,
        fontWeight: 500,
        borderRadius: `${theme.custom.radius.section}px`,
        lineHeight: 1.3,
        paddingTop: theme.spacing(0.25),
        paddingBottom: theme.spacing(0.25),
        paddingLeft: theme.spacing(0.5),
        paddingRight: theme.spacing(0.5),
        marginInlineStart: theme.spacing(0.5),
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        border: `1px solid ${theme.palette[color]?.main ?? theme.palette.divider}`,
        background: theme.palette[color]?.light ?? theme.palette.action.hover,
        color: theme.palette[color]?.dark ?? theme.palette.text.secondary,
      })}
    >
      {text}
    </Box>
  );
}

EpistemicRoleBadge.propTypes = {
  role: PropTypes.string,
  t: PropTypes.func.isRequired,
};
