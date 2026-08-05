import Popper from '@mui/material/Popper';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Grow from '@mui/material/Grow';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import FocusTrap from '@mui/material/Unstable_TrapFocus';
import { alpha, useTheme } from '@mui/material/styles';
import PropTypes from 'prop-types';
import { useLanguage } from '../context/LanguageContext.jsx';

const CARD_WIDTH = 344;

function StepDots({ total, current, color, mutedColor }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <Box
          key={i}
          sx={{
            width: i === current ? 18 : 6,
            height: 6,
            borderRadius: 999,
            bgcolor: i === current ? color : mutedColor,
            transition: 'width 200ms ease, background-color 200ms ease',
          }}
        />
      ))}
    </Box>
  );
}

StepDots.propTypes = {
  total: PropTypes.number.isRequired,
  current: PropTypes.number.isRequired,
  color: PropTypes.string.isRequired,
  mutedColor: PropTypes.string.isRequired,
};

export function TourStepCard({
  step,
  stepNumber,
  totalSteps,
  anchorEl,
  isFirst,
  isLast,
  onNext,
  onBack,
  onSkip,
}) {
  const theme = useTheme();
  const { t } = useLanguage();

  const titleId = `tour-step-${step.id}-title`;
  const bodyId = `tour-step-${step.id}-body`;
  const title = t(`tour.mainShell.${step.id}.title`);
  const body = t(`tour.mainShell.${step.id}.body`);

  return (
    <Popper
      open
      anchorEl={anchorEl}
      placement="bottom"
      transition
      sx={{ zIndex: theme.zIndex.tooltip + 30 }}
      modifiers={[
        { name: 'offset', options: { offset: [0, 18] } },
        { name: 'flip', options: { fallbackPlacements: ['top', 'right', 'left'] } },
        // altAxis + no tether: tall anchors (e.g. the showcase panel) leave no
        // room on any side — clamp the card fully inside the viewport instead
        // of letting it slide under the bottom edge.
        { name: 'preventOverflow', options: { padding: 12, altAxis: true, tether: false } },
      ]}
    >
      {({ TransitionProps }) => (
        <Grow {...TransitionProps} timeout={220}>
          <div>
            <FocusTrap open disableRestoreFocus>
              <Paper
                role="dialog"
                aria-modal="false"
                aria-labelledby={titleId}
                aria-describedby={bodyId}
                tabIndex={-1}
                elevation={0}
                sx={{
                  width: `min(${CARD_WIDTH}px, calc(100vw - 24px))`,
                  p: 2.25,
                  borderRadius: `${theme.custom.radius.section}px`,
                  border: theme.custom.border.hairline,
                  boxShadow: theme.custom.elevation.modal,
                  bgcolor: 'background.paper',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box
                    aria-hidden="true"
                    sx={{
                      flexShrink: 0,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      fontSize: 14,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {stepNumber}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography id={titleId} sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.35 }}>
                      {title}
                    </Typography>
                    <Typography id={bodyId} variant="body2" sx={{ mt: 0.75, color: 'text.secondary' }}>
                      {body}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <StepDots
                    total={totalSteps}
                    current={stepNumber - 1}
                    color={theme.palette.primary.main}
                    mutedColor={alpha(theme.palette.primary.main, 0.22)}
                  />
                  <Typography variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                    {t('tour.stepCounter', { current: stepNumber, total: totalSteps })}
                  </Typography>
                  <Box sx={{ flexGrow: 1 }} />
                </Box>

                <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button size="small" color="inherit" disableFocusRipple onClick={onSkip} sx={{ color: 'text.secondary' }}>
                    {t('tour.skip')}
                  </Button>
                  <Box sx={{ flexGrow: 1 }} />
                  {!isFirst && (
                    <Button size="small" variant="text" disableFocusRipple onClick={onBack}>
                      {t('tour.back')}
                    </Button>
                  )}
                  <Button size="small" variant="contained" disableFocusRipple onClick={onNext} autoFocus>
                    {isLast ? t('tour.done') : t('tour.next')}
                  </Button>
                </Box>
              </Paper>
            </FocusTrap>
          </div>
        </Grow>
      )}
    </Popper>
  );
}

TourStepCard.propTypes = {
  step: PropTypes.shape({ id: PropTypes.string.isRequired }).isRequired,
  stepNumber: PropTypes.number.isRequired,
  totalSteps: PropTypes.number.isRequired,
  anchorEl: PropTypes.object,
  isFirst: PropTypes.bool.isRequired,
  isLast: PropTypes.bool.isRequired,
  onNext: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  onSkip: PropTypes.func.isRequired,
};
