import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { formatDate, formatPublishedDateTime } from '../lib/date.js';
import { formatTemplate } from '../lib/i18nFormat.js';
import {
  formatWindowRangeLabel,
} from '../lib/reportEditionFormat.js';

const windowShape = PropTypes.shape({
  days: PropTypes.number,
  report_date: PropTypes.string,
  window_start: PropTypes.string,
  window_end: PropTypes.string,
});

export function ReportEditionContextBar({
  reportScope,
  reportDate,
  generatedAt,
  assessmentWindow = null,
}) {
  const { t } = useLanguage();
  const scopeLabel = t(`report.scope.${reportScope ?? 'national'}`);
  const anchorDate = reportDate ?? assessmentWindow?.report_date ?? null;
  if (!anchorDate && !generatedAt) return null;

  const editionLike = {
    date: anchorDate,
    window_start: assessmentWindow?.window_start ?? null,
    window_end: assessmentWindow?.window_end ?? anchorDate,
    assessment_days: assessmentWindow?.days ?? null,
  };
  const windowRange = formatWindowRangeLabel(t, editionLike);
  const runLabel = generatedAt
    ? formatTemplate(t('report.edition.analyzedAt'), { time: formatPublishedDateTime(generatedAt) })
    : null;

  const line = formatTemplate(t('report.edition.contextLine'), {
    scope: scopeLabel,
    reportDate: anchorDate ? formatDate(anchorDate) : '—',
    windowRange,
    runTime: runLabel ?? '—',
  });

  return (
    <Box
      sx={(theme) => ({
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        background: theme.palette.background.default,
        padding: theme.spacing(1, 1.5),
      })}
    >
      <Typography variant="caption" color="text.secondary" component="p">
        {line}
      </Typography>
    </Box>
  );
}

ReportEditionContextBar.propTypes = {
  reportScope: PropTypes.string,
  reportDate: PropTypes.string,
  generatedAt: PropTypes.string,
  assessmentWindow: windowShape,
};
