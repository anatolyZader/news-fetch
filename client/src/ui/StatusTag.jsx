import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';

const VALID = new Set(['critical', 'weak', 'moderate', 'good', 'strong', 'alert', 'neutral']);

export function StatusTag({ variant = 'neutral', children, className = '' }) {
  const key = VALID.has(variant) ? variant : 'neutral';
  return (
    <Chip
      label={children}
      size="small"
      className={className}
      sx={(theme) => {
        const tone = theme.palette.score?.[key] ?? theme.palette.score.neutral;
        return {
          height: 'auto',
          minHeight: theme.spacing(2.75),
          borderRadius: `${theme.custom.radius.section}px`,
          fontWeight: 700,
          fontSize: theme.typography.caption.fontSize,
          color: tone.main,
          backgroundColor: tone.soft,
          border: `1px solid ${alpha(tone.main, 0.3)}`,
          '& .MuiChip-label': {
            paddingLeft: theme.spacing(0.75),
            paddingRight: theme.spacing(0.75),
            whiteSpace: 'normal',
            lineHeight: 1.25,
          },
        };
      }}
    />
  );
}

StatusTag.propTypes = {
  variant: PropTypes.oneOf(['critical', 'weak', 'moderate', 'good', 'strong', 'alert', 'neutral']),
  children: PropTypes.node,
  className: PropTypes.string,
};
