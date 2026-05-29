import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { deriveEvidenceOverviewCounts } from '../lib/epistemicBannerMessages.js';

function formatTemplate(template, params = {}) {
  if (!template) return '';
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, value == null ? '—' : String(value)),
    template,
  );
}

export function EvidenceOverviewPanel({ assessment, reportScope, displayTier }) {
  const { t } = useLanguage();

  if (displayTier === 'analyst') return null;

  const counts = deriveEvidenceOverviewCounts(assessment);
  if (counts.total === 0) return null;

  const scopeLabel =
    assessment?.report_scope?.label
    ?? t(`report.scope.${reportScope}`)
    ?? reportScope
    ?? '—';

  const body = formatTemplate(t('report.instrument.summaryBody'), {
    scope: scopeLabel,
    adequate: counts.adequate,
    total: counts.total,
    thin: counts.thin,
    contested: counts.contested,
  });

  return (
    <Box
      sx={(theme) => ({
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        background: theme.palette.background.paper,
        padding: theme.spacing(1.5, 2),
      })}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 600, marginBottom: 0.5 }}>
        {t('report.instrument.summaryTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {body}
      </Typography>
      {counts.significant > 0 && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', marginTop: 0.75 }}>
          {t('report.instrument.significantShifts').replace('{n}', String(counts.significant))}
        </Typography>
      )}
    </Box>
  );
}

EvidenceOverviewPanel.propTypes = {
  assessment: PropTypes.object,
  reportScope: PropTypes.string,
  displayTier: PropTypes.oneOf(['operator', 'analyst']),
};
