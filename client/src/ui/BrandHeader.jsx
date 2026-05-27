import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

const ALIGN_MAP = {
  start: { alignItems: 'flex-start', textAlign: 'left' },
  end:   { alignItems: 'flex-end',   textAlign: 'right' },
  center:{ alignItems: 'center',     textAlign: 'center' },
};

export const BrandHeader = (props) => {
  const { title, subtitle, align = 'start', onHomeClick, homeAriaLabel } = props;
  const alignSx = ALIGN_MAP[align] ?? ALIGN_MAP.start;
  const titleNode = (
    <Typography variant="h1" component="h1">
      {title}
    </Typography>
  );

  return (
    <Stack
      spacing={0.25}
      sx={() => ({
        ...alignSx,
        '[dir="rtl"] &': align === 'start'
          ? { alignItems: 'flex-end', textAlign: 'right' }
          : alignSx,
      })}
    >
      {onHomeClick ? (
        <ButtonBase
          type="button"
          onClick={onHomeClick}
          aria-label={homeAriaLabel}
          sx={(theme) => ({
            alignSelf: alignSx.alignItems,
            textAlign: alignSx.textAlign,
            borderRadius: `${theme.custom.radius.section}px`,
            padding: theme.spacing(0.25, 0.5),
            margin: theme.spacing(-0.25, -0.5),
            '&:hover': { background: theme.palette.action.hover },
          })}
        >
          {titleNode}
        </ButtonBase>
      ) : (
        titleNode
      )}
      {subtitle && (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </Stack>
  );
};

BrandHeader.propTypes = {
  title: PropTypes.node.isRequired,
  subtitle: PropTypes.node,
  align: PropTypes.oneOf(['start', 'end', 'center']),
  onHomeClick: PropTypes.func,
  homeAriaLabel: PropTypes.string,
};
