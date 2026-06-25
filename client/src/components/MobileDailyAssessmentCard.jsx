import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { DailyAssessmentControls } from './DailyAssessmentControls.jsx';
import { mobileFieldRowSx, mobileSurfaceCardSx } from '../ui/responsive/mobileDashboardSx.js';

const editionShape = PropTypes.shape({
  date: PropTypes.string.isRequired,
  run_id: PropTypes.string,
  generated_at: PropTypes.string,
  assessment_days: PropTypes.number,
  window_start: PropTypes.string,
  window_end: PropTypes.string,
  total_articles: PropTypes.number,
  is_today: PropTypes.bool,
});

const editionSelectionShape = PropTypes.shape({
  date: PropTypes.string.isRequired,
  run_id: PropTypes.string,
});

export function MobileDailyAssessmentCard({
  reportScope,
  onReportScopeChange,
  selectedReportEdition,
  onSelectedReportEditionChange,
  editions = [],
  loadedEdition = null,
  editionsLoading = false,
  onOpenReportContents,
  outdatedMessage = null,
}) {
  const { t } = useLanguage();

  return (
    <Box sx={(theme) => mobileSurfaceCardSx(theme)}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center">
          <GridViewOutlinedIcon fontSize="small" color="primary" />
          <Typography variant="h2" component="h2" sx={{ m: 0, fontSize: '1.05rem' }}>
            {t('nav.dailyAssessment')}
          </Typography>
        </Stack>

        <DailyAssessmentControls
          reportScope={reportScope}
          onReportScopeChange={onReportScopeChange}
          selectedReportEdition={selectedReportEdition}
          onSelectedReportEditionChange={onSelectedReportEditionChange}
          editions={editions}
          loadedEdition={loadedEdition}
          editionsLoading={editionsLoading}
          compact
        />

        {onOpenReportContents && (
          <Box
            component="button"
            type="button"
            onClick={onOpenReportContents}
            sx={(theme) => ({
              ...mobileFieldRowSx(theme),
              border: 'none',
              font: 'inherit',
              color: theme.palette.primary.main,
            })}
          >
            <ListAltOutlinedIcon fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
            <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, textAlign: 'start' }}>
              {t('app.reportContents')}
            </Typography>
            <ChevronRightIcon fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
          </Box>
        )}

        {outdatedMessage && (
          <Alert severity="warning" variant="outlined" sx={{ minWidth: 0, '& .MuiAlert-message': { wordBreak: 'break-word' } }}>
            {outdatedMessage}
          </Alert>
        )}
      </Stack>
    </Box>
  );
}

MobileDailyAssessmentCard.propTypes = {
  reportScope: PropTypes.string.isRequired,
  onReportScopeChange: PropTypes.func.isRequired,
  selectedReportEdition: editionSelectionShape,
  onSelectedReportEditionChange: PropTypes.func.isRequired,
  editions: PropTypes.arrayOf(editionShape),
  loadedEdition: editionShape,
  editionsLoading: PropTypes.bool,
  onOpenReportContents: PropTypes.func,
  outdatedMessage: PropTypes.string,
};
