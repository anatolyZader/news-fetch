import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { ReportEditionPicker } from './ReportEditionPicker.jsx';
import { reportScopePillsSx, mobileSegmentedPillsSx } from '../ui/index.js';

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

export function DailyAssessmentControls({
  reportScope,
  onReportScopeChange,
  selectedReportEdition,
  onSelectedReportEditionChange,
  editions = [],
  loadedEdition = null,
  editionsLoading = false,
  compact = false,
}) {
  const { t } = useLanguage();
  const pillsSx = compact ? mobileSegmentedPillsSx : reportScopePillsSx;

  return (
    <Stack
      direction={compact ? 'column' : 'row'}
      alignItems={compact ? 'stretch' : 'center'}
      spacing={compact ? 1.5 : 2}
      useFlexGap
      flexWrap="wrap"
      sx={{ width: compact ? '100%' : 'auto', flexShrink: 0 }}
    >
      <ToggleButtonGroup
        data-tour="scope-toggle"
        exclusive
        size="small"
        value={reportScope}
        onChange={(_, next) => {
          if (next) onReportScopeChange(next);
        }}
        aria-label={t('report.scope.label')}
        sx={(theme) => pillsSx(theme)}
        fullWidth={compact}
      >
        <ToggleButton value="national">{t('report.scope.national')}</ToggleButton>
        <ToggleButton value="north">{t('report.scope.north')}</ToggleButton>
      </ToggleButtonGroup>
      {editions.length >= 1 && (
        <ReportEditionPicker
          editions={editions}
          selectedEdition={selectedReportEdition}
          loadedEdition={loadedEdition}
          onChange={onSelectedReportEditionChange}
          loading={editionsLoading}
          compact={compact}
        />
      )}
    </Stack>
  );
}

DailyAssessmentControls.propTypes = {
  reportScope: PropTypes.string.isRequired,
  onReportScopeChange: PropTypes.func.isRequired,
  selectedReportEdition: editionSelectionShape,
  onSelectedReportEditionChange: PropTypes.func.isRequired,
  editions: PropTypes.arrayOf(editionShape),
  loadedEdition: editionShape,
  editionsLoading: PropTypes.bool,
  compact: PropTypes.bool,
};
