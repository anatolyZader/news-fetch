import { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { StatusTag } from '../ui/index.js';

function formatTemplate(template, params = {}) {
  if (!template) return '';
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, value == null ? '—' : String(value)),
    template,
  );
}

const LEVEL_VARIANT = {
  critical: 'critical',
  warning: 'alert',
  watch: 'moderate',
};

export function OperatorRecommendationsPanel({
  recommendations = [],
  reportDate,
  reportScope = 'national',
  onUpdated,
}) {
  const { t } = useLanguage();
  const { getIdToken } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const pending = (recommendations ?? []).filter((r) => r.status === 'pending');

  const submitAction = useCallback(async (rec, action) => {
    setBusyId(rec.id);
    setError(null);
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const r = await fetch(`/api/report/recommendations/${encodeURIComponent(rec.id)}/acknowledge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action,
          scope: reportScope,
          date: reportDate,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? 'Request failed');
        return;
      }
      onUpdated?.(data.recommendation);
    } catch (err) {
      setError(err?.message ?? 'Request failed');
    } finally {
      setBusyId(null);
    }
  }, [getIdToken, onUpdated, reportDate, reportScope]);

  if (pending.length === 0) return null;

  return (
    <Box
      component="section"
      aria-label={t('recommendations.panelTitle')}
      sx={(theme) => ({
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        overflow: 'hidden',
        background: theme.palette.background.paper,
        boxShadow: theme.custom.elevation.subtle,
      })}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={(theme) => ({
          padding: theme.spacing(1.25, 1.5),
          borderBottom: theme.custom.border.hairline,
          background: theme.palette.action.hover,
        })}
      >
        <Typography variant="cardTitle">{t('recommendations.panelTitle')}</Typography>
        <Typography variant="caption" color="text.secondary">
          {t('recommendations.pendingCount').replace('{n}', String(pending.length))}
        </Typography>
      </Stack>

      {error && (
        <Alert severity="error" variant="outlined" sx={{ m: 1.5, mb: 0 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={0}>
        {pending.map((rec) => {
          const title = t(rec.title_key);
          const detail = rec.detail_key
            ? formatTemplate(t(rec.detail_key), rec.detail_params ?? {})
            : '';
          const actionHint = rec.suggested_action_key ? t(rec.suggested_action_key) : '';
          return (
            <Box
              key={rec.id}
              sx={(theme) => ({
                padding: theme.spacing(1.5),
                borderBottom: theme.custom.border.hairline,
                '&:last-child': { borderBottom: 'none' },
              })}
            >
              <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <StatusTag variant={LEVEL_VARIANT[rec.level] ?? 'neutral'}>
                      {rec.level ?? 'watch'}
                    </StatusTag>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {title}
                    </Typography>
                  </Stack>
                  {detail && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                      {detail}
                    </Typography>
                  )}
                  {actionHint && (
                    <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                      {actionHint}
                    </Typography>
                  )}
                  {(rec.evidence_refs ?? []).slice(0, 2).map((ref, idx) => (
                    <Typography key={`${rec.id}-ev-${idx}`} variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {ref.signal_type}: {String(ref.evidence ?? '').slice(0, 120)}
                    </Typography>
                  ))}
                </Box>
                <Stack direction="row" spacing={0.75} flexShrink={0}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busyId === rec.id}
                    onClick={() => submitAction(rec, 'dismiss')}
                  >
                    {t('recommendations.dismiss')}
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busyId === rec.id}
                    onClick={() => submitAction(rec, 'acknowledge')}
                  >
                    {t('recommendations.acknowledge')}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

OperatorRecommendationsPanel.propTypes = {
  recommendations: PropTypes.arrayOf(PropTypes.object),
  reportDate: PropTypes.string,
  reportScope: PropTypes.string,
  onUpdated: PropTypes.func,
};
