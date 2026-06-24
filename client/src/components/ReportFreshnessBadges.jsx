import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { formatDate, formatPublishedDateTime } from '../lib/date.js';
import { formatTemplate } from '../lib/i18nFormat.js';

export function ReportFreshnessBadges({ reportDate, generatedAt }) {
  const { t } = useLanguage();
  const gatheredLabel = reportDate ? formatDate(reportDate) : null;
  const analysisLabel = generatedAt ? formatPublishedDateTime(generatedAt) : null;

  if (!gatheredLabel && !analysisLabel) return null;

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {analysisLabel && (
        <Chip
          size="small"
          variant="outlined"
          label={formatTemplate(t('report.freshness.analysisRun'), { date: analysisLabel })}
        />
      )}
      {gatheredLabel && (
        <Chip
          size="small"
          variant="outlined"
          label={formatTemplate(t('report.freshness.reportDate'), { date: gatheredLabel })}
        />
      )}
    </Stack>
  );
}

ReportFreshnessBadges.propTypes = {
  reportDate: PropTypes.string,
  generatedAt: PropTypes.string,
};
