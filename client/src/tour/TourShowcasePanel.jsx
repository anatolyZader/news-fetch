import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useTourOptional } from './tourContext.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { ComponentCard } from '../components/ReportView.jsx';
import { TOUR_SHOWCASE_COMPONENT, TOUR_SHOWCASE_REPORT_DATE } from './showcaseFixture.js';

const SHOWCASE_STEP_IDS = new Set(['component-narrative', 'component-evidence']);

/**
 * Centered demo panel for the tour's narrative/evidence steps: renders the
 * frozen showcase component through the real ComponentCard so the tour's
 * data-tour anchors resolve inside it, identical for every user. Sits below
 * the tour scrim so the spotlight cuts its hole over the demo content.
 */
export function TourShowcasePanel() {
  const theme = useTheme();
  const tour = useTourOptional();
  const { t, lang } = useLanguage();

  // The pending step (set before anchor resolution) mounts the panel early so
  // the engine finds its anchor; the committed step keeps it mounted while the
  // engine navigates AWAY, so spotlight and step card never point at a
  // just-removed element mid-transition.
  const pendingId = tour?.activeStepId ?? null;
  const currentId = tour?.currentStepId ?? null;
  let stepId = null;
  if (SHOWCASE_STEP_IDS.has(pendingId)) stepId = pendingId;
  else if (SHOWCASE_STEP_IDS.has(currentId)) stepId = currentId;

  const [evidenceOpen, setEvidenceOpen] = useState(false);
  useEffect(() => {
    if (stepId) setEvidenceOpen(stepId === 'component-evidence');
  }, [stepId]);

  if (!stepId) return null;

  const comp = TOUR_SHOWCASE_COMPONENT[lang] ?? TOUR_SHOWCASE_COMPONENT.en;

  return createPortal(
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: theme.zIndex.tooltip + 10,
        display: 'grid',
        placeItems: 'center',
        p: 2,
        pointerEvents: 'none',
      }}
    >
      <Paper
        data-tour-priority=""
        elevation={0}
        sx={{
          pointerEvents: 'auto',
          width: 'min(680px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 160px)',
          overflowY: 'auto',
          p: 2,
          borderRadius: `${theme.custom.radius.section}px`,
          border: theme.custom.border.hairline,
          boxShadow: theme.custom.elevation.modal,
          bgcolor: 'background.paper',
          // Evidence step: hide the narrative so the spotlighted evidence list
          // gets the panel's full height instead of being scroll-clipped.
          ...(stepId === 'component-evidence' && {
            '& [data-tour="component-narrative"]': { display: 'none' },
          }),
        }}
      >
        <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
          {t('tour.showcase.caption')}
        </Typography>
        <ComponentCard
          comp={comp}
          t={t}
          reportDate={TOUR_SHOWCASE_REPORT_DATE}
          sourceSignals={[]}
          open
          evidenceOpen={evidenceOpen}
          autoExpandFirstSourceGroup
          onToggle={() => {}}
          onEvidenceToggle={setEvidenceOpen}
        />
      </Paper>
    </Box>,
    document.body,
  );
}
