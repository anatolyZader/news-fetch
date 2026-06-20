import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import {
  deriveOperatorReportContext,
  formatOperatorContextTemplate,
} from '../lib/operatorReportContextLine.js';

export function OperatorReportContextLine({ assessment, reportScope }) {
  const { t } = useLanguage();
  const ctx = deriveOperatorReportContext(assessment, {
    scopeLabel: assessment?.report_scope?.label
      ?? (reportScope ? t(`report.scope.${reportScope}`) : null)
      ?? reportScope,
  });

  const line = formatOperatorContextTemplate(t('report.operatorContext.line'), {
    scope: ctx.scopeLabel,
    voidLevel: ctx.voidLevel,
    narrativeMode: ctx.narrativeMode,
    n: ctx.scopeSignalCount,
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

OperatorReportContextLine.propTypes = {
  assessment: PropTypes.object,
  reportScope: PropTypes.string,
};
