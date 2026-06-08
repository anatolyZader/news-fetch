import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { authFetch } from '../lib/authFetch.js';

/**
 * Analyst panel: agent vs shadow score divergence.
 */
export function AgentDivergencePanel({
  reportDate,
  reportScope = 'national',
  assessmentDegraded = null,
  agentTraceId = null,
}) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!reportDate) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ date: reportDate, scope: reportScope });
        const res = await authFetch(`/api/report/divergence?${qs}`);
        if (!res.ok) throw new Error('not_found');
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e?.message ?? 'failed');
      }
    })();
    return () => { cancelled = true; };
  }, [reportDate, reportScope]);

  const showDegradeNote = !agentTraceId && assessmentDegraded?.mode;

  if ((error || !data) && !showDegradeNote) return null;

  const rate = data?.alignment_rate == null
    ? '—'
    : `${Math.round(data.alignment_rate * 100)}%`;

  return (
    <Box
      component="section"
      sx={(theme) => ({
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        p: 2,
        mb: 2,
        background: theme.palette.background.paper,
      })}
    >
      <Typography variant="subtitle2" component="h2" sx={{ mb: 1 }}>
        {t('report.divergence.panelTitle')}
      </Typography>
      {showDegradeNote && (
        <Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>
          {t('report.divergence.degradedNote', {
            mode: assessmentDegraded.mode,
            reason: assessmentDegraded.reason ?? '',
          })}
        </Typography>
      )}
      {data && (
        <>
      <Typography variant="body2" color="text.secondary">
        {t('report.divergence.alignmentRate')}: {rate}
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2, mt: 1 }}>
        {Object.entries(data.by_component ?? {}).slice(0, 8).map(([id, row]) => (
          <Typography component="li" variant="caption" key={id} display="block">
            {id}: agent={row.agent_severity ?? '—'}, shadow={row.shadow_score ?? '—'}
          </Typography>
        ))}
      </Box>
        </>
      )}
    </Box>
  );
}

AgentDivergencePanel.propTypes = {
  reportDate: PropTypes.string,
  reportScope: PropTypes.string,
  assessmentDegraded: PropTypes.shape({
    mode: PropTypes.string,
    reason: PropTypes.string,
  }),
  agentTraceId: PropTypes.string,
};
