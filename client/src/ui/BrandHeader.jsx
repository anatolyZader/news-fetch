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

function BrandMark({ src, alt }) {
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      sx={(theme) => ({
        flexShrink: 0,
        height: theme.spacing(9),
        width: 'auto',
        maxHeight: theme.spacing(9),
        display: 'block',
        userSelect: 'none',
      })}
    />
  );
}

BrandMark.propTypes = {
  src: PropTypes.string.isRequired,
  alt: PropTypes.string,
};

export function BrandHeader({
  title,
  subtitle,
  align = 'start',
  onHomeClick,
  homeAriaLabel,
  logoSrc,
  logoAlt = '',
}) {
  const alignSx = ALIGN_MAP[align] ?? ALIGN_MAP.start;

  const titleBlock = (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{
        alignSelf: alignSx.alignItems,
        '[dir="rtl"] &': { flexDirection: 'row-reverse' },
      }}
    >
      {logoSrc && <BrandMark src={logoSrc} alt={logoAlt} />}
      <Stack spacing={0.125} sx={{ minWidth: 0, textAlign: alignSx.textAlign }}>
        <Typography variant="h1" component="h1" sx={{ lineHeight: 1.2 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.35 }}>
            {subtitle}
          </Typography>
        )}
      </Stack>
    </Stack>
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
  onHomeClick: PropTypes.func,
  homeAriaLabel: PropTypes.string,
  logoSrc: PropTypes.string,
  logoAlt: PropTypes.string,
};
