import { createPortal } from 'react-dom';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Grow from '@mui/material/Grow';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import FocusTrap from '@mui/material/Unstable_TrapFocus';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import PropTypes from 'prop-types';
import { useLanguage } from '../context/LanguageContext.jsx';

const CARD_WIDTH = 460;

/**
 * Centered welcome card shown before the numbered tour steps: a full scrim
 * (no spotlight hole) with a plain-language framing of the app and the tour.
 */
export function TourIntroCard({ onStart, onSkip }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const titleId = 'tour-intro-title';
  const bodyId = 'tour-intro-body';

  return createPortal(
    <>
      <div
        data-tour-overlay=""
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: theme.zIndex.tooltip + 20,
          backgroundColor: theme.custom.surface.tourScrim,
        }}
      />
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: theme.zIndex.tooltip + 30,
          display: 'grid',
          placeItems: 'center',
          p: 2,
        }}
      >
        <Grow in timeout={reducedMotion ? 0 : 220}>
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
                  width: `min(${CARD_WIDTH}px, calc(100vw - 32px))`,
                  maxHeight: 'calc(100vh - 48px)',
                  overflowY: 'auto',
                  p: 3,
                  borderRadius: `${theme.custom.radius.section}px`,
                  border: theme.custom.border.hairline,
                  boxShadow: theme.custom.elevation.modal,
                  bgcolor: 'background.paper',
                }}
              >
                <Typography id={titleId} sx={{ fontWeight: 700, fontSize: 19, lineHeight: 1.3 }}>
                  {t('tour.intro.title')}
                </Typography>
                <Box id={bodyId}>
                  {t('tour.intro.body').split('\n\n').map((paragraph, i) => (
                    <Typography key={i} variant="body2" sx={{ mt: 1.25, color: 'text.secondary' }}>
                      {paragraph}
                    </Typography>
                  ))}
                </Box>

                <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button size="small" color="inherit" onClick={onSkip} sx={{ color: 'text.secondary' }}>
                    {t('tour.skip')}
                  </Button>
                  <Box sx={{ flexGrow: 1 }} />
                  <Button size="small" variant="contained" onClick={onStart} autoFocus>
                    {t('tour.intro.start')}
                  </Button>
                </Box>
              </Paper>
            </FocusTrap>
          </div>
        </Grow>
      </Box>
    </>,
    document.body,
  );
}

TourIntroCard.propTypes = {
  onStart: PropTypes.func.isRequired,
  onSkip: PropTypes.func.isRequired,
};
