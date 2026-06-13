import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

const ALIGN_MAP = {
  start: { alignItems: 'flex-start', textAlign: 'left' },
  end:   { alignItems: 'flex-end',   textAlign: 'right' },
  center:{ alignItems: 'center',     textAlign: 'center' },
};

export function BrandHeader({
  title,
  subtitle,
  align = 'start',
  variant = 'default',
  onHomeClick,
  homeAriaLabel,
  logoSrc,
  logoAlt = '',
}) {
  const alignSx = ALIGN_MAP[align] ?? ALIGN_MAP.start;
  const isCompact = variant === 'compact';

  const titleBlock = (
    <Stack
      direction="row"
      alignItems="center"
      spacing={isCompact ? 1 : { xs: 1, sm: 1.5 }}
      sx={(theme) => ({
        alignSelf: alignSx.alignItems,
        '[dir="rtl"] &': { flexDirection: 'row-reverse' },
        ...(isCompact
          ? { justifyContent: 'center' }
          : {
            [theme.breakpoints.down('sm')]: {
              flexDirection: 'column',
              alignItems: 'center',
              alignSelf: 'center',
              justifyContent: 'center',
              '[dir="rtl"] &': { flexDirection: 'column' },
            },
          }),
      })}
    >
      {logoSrc && (
        <Box
          component="img"
          src={logoSrc}
          alt={logoAlt}
          sx={(theme) => ({
            flexShrink: 0,
            height: isCompact ? theme.spacing(5) : theme.spacing(9),
            width: 'auto',
            maxHeight: isCompact ? theme.spacing(5) : theme.spacing(9),
            display: 'block',
            userSelect: 'none',
          })}
        />
      )}
      <Stack
        spacing={0.125}
        sx={(theme) => ({
          minWidth: 0,
          textAlign: isCompact ? 'center' : alignSx.textAlign,
          ...(!isCompact && {
            [theme.breakpoints.down('sm')]: {
              textAlign: 'center',
              alignItems: 'center',
            },
          }),
        })}
      >
        <Typography
          variant="h1"
          component="h1"
          sx={(theme) => ({
            lineHeight: 1.2,
            ...(isCompact && {
              fontSize: theme.typography.h3.fontSize,
              fontWeight: 700,
            }),
          })}
        >
          {title}
        </Typography>
        {subtitle && !isCompact && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={(theme) => ({
              lineHeight: 1.35,
              [theme.breakpoints.down('sm')]: {
                display: 'none',
              },
            })}
          >
            {subtitle}
          </Typography>
        )}
      </Stack>
    </Stack>
  );

  return (
    <Stack
      spacing={0.25}
      sx={(theme) => ({
        ...alignSx,
        ...(isCompact
          ? { alignItems: 'center', width: 'auto' }
          : {
            [theme.breakpoints.down('sm')]: {
              alignItems: 'center',
              textAlign: 'center',
              width: '100%',
            },
          }),
        '[dir="rtl"] &': align === 'start' && !isCompact
          ? {
            [theme.breakpoints.up('sm')]: { alignItems: 'flex-end', textAlign: 'right' },
          }
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
            [theme.breakpoints.down('sm')]: isCompact
              ? undefined
              : { alignSelf: 'center', textAlign: 'center' },
          })}
        >
          {titleBlock}
        </ButtonBase>
      ) : (
        titleBlock
      )}
    </Stack>
  );
}

BrandHeader.propTypes = {
  title: PropTypes.node.isRequired,
  subtitle: PropTypes.node,
  align: PropTypes.oneOf(['start', 'end', 'center']),
  variant: PropTypes.oneOf(['default', 'compact']),
  onHomeClick: PropTypes.func,
  homeAriaLabel: PropTypes.string,
  logoSrc: PropTypes.string,
  logoAlt: PropTypes.string,
};
