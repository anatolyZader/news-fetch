import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { StatusTag } from '../ui/index.js';

const STAGE_VARIANT = {
  ok: 'good',
  missing: 'alert',
  disabled: 'neutral',
  error: 'critical',
};

const OVERALL_VARIANT = {
  complete: 'good',
  partial: 'moderate',
  missing: 'critical',
};

const HEALTH_VARIANT = {
  ok: 'good',
  degraded: 'moderate',
  unhealthy: 'critical',
};

/**
 * Accepts monitoring summary (nested pipeline/cost/health) or legacy flat pipeline status.
 * @param {object | null | undefined} data
 */
function normalizeSummary(data) {
  if (!data) return null;
  if (data.pipeline) {
    return {
      date: data.date,
      is_stale: data.is_stale,
      overall: data.pipeline.overall,
      stages: data.pipeline.stages,
      cost: data.cost,
      health: data.health,
      stage_telemetry: data.stage_telemetry,
      latency: data.latency ?? null,
    };
  }
  return {
    date: data.date,
    is_stale: data.is_stale,
    overall: data.overall,
    stages: data.stages,
    cost: data.cost,
    health: data.health ?? null,
    stage_telemetry: data.stage_telemetry ?? null,
    latency: data.latency ?? null,
  };
}

function StageRow({ stage, t }) {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ py: 0.5 }}>
      <StatusTag variant={STAGE_VARIANT[stage.status] ?? 'neutral'}>
        {t(`pipeline.stage.${stage.status}`)}
      </StatusTag>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2">{stage.label}</Typography>
        <Typography variant="caption" color="text.secondary">
          {stage.meta?.total_articles != null && `${stage.meta.total_articles} articles`}
          {stage.meta?.totalCostUsd != null && ` · $${stage.meta.totalCostUsd.toFixed(2)}`}
          {stage.mtime && ` · ${stage.mtime.slice(0, 19).replace('T', ' ')}`}
        </Typography>
      </Box>
    </Stack>
  );
}

StageRow.propTypes = {
  stage: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
};

function StageDropRow({ stageName, stats, t }) {
  const dropRate =
    stats.input > 0 ? Math.round((stats.dropped / stats.input) * 100) : 0;
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
      {t('monitoring.stageTelemetry.stageLine')
        .replace('{stage}', stageName)
        .replace('{dropped}', String(stats.dropped))
        .replace('{input}', String(stats.input))
        .replace('{rate}', String(dropRate))}
    </Typography>
  );
}

StageDropRow.propTypes = {
  stageName: PropTypes.string.isRequired,
  stats: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
};

function LatencyRow({ metricName, stats }) {
  const p50 = stats?.p50 ?? 0;
  const p95 = stats?.p95 ?? 0;
  const count = stats?.count ?? 0;
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
      {metricName}: n={count}, p50={Math.round(p50)}ms, p95={Math.round(p95)}ms
    </Typography>
  );
}

LatencyRow.propTypes = {
  metricName: PropTypes.string.isRequired,
  stats: PropTypes.object.isRequired,
};

export function PipelineStatusPanel({ data, loading, error, defaultOpen = false }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(defaultOpen);

  if (loading && !data) {
    return (
      <Box sx={{ mb: 1 }}>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="warning" variant="outlined" sx={{ mb: 1 }}>
        {t('pipeline.loadError').replace('{msg}', error)}
      </Alert>
    );
  }

  const summary = normalizeSummary(data);
  if (!summary) return null;

  const droppedTotal = summary.stage_telemetry?.totals?.dropped ?? 0;
  const healthStatus = summary.health?.status;
  const needsHighlight =
    summary.is_stale || summary.overall !== 'complete' || healthStatus === 'degraded' || healthStatus === 'unhealthy';
  const variant = OVERALL_VARIANT[summary.overall] ?? 'neutral';

  return (
    <Box
      component="section"
      aria-label={t('pipeline.panelTitle')}
      sx={(theme) => ({
        marginBottom: theme.spacing(1),
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        overflow: 'hidden',
        background: needsHighlight ? theme.palette.action.hover : theme.palette.background.paper,
      })}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={(theme) => ({
          paddingTop: theme.spacing(1),
          paddingBottom: theme.spacing(1),
          paddingLeft: theme.spacing(1.5),
          paddingRight: theme.spacing(0.5),
          cursor: 'pointer',
        })}
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2">{t('pipeline.panelTitle')}</Typography>
          <StatusTag variant={variant}>{t(`pipeline.overall.${summary.overall}`)}</StatusTag>
          {healthStatus && healthStatus !== 'ok' && (
            <StatusTag variant={HEALTH_VARIANT[healthStatus] ?? 'moderate'}>
              {t(`monitoring.health.${healthStatus}`)}
            </StatusTag>
          )}
          {summary.is_stale && (
            <Typography variant="caption" color="warning.main">
              {t('pipeline.stale').replace('{date}', summary.date)}
            </Typography>
          )}
        </Stack>
        <IconButton size="small" aria-label={open ? t('pipeline.collapse') : t('pipeline.expand')}>
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Stack>

      <Collapse in={open}>
        <Box sx={(theme) => ({ padding: theme.spacing(1.5), paddingTop: 0 })}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {t('pipeline.costSummary')
              .replace('{total}', `$${(summary.cost?.total_usd ?? 0).toFixed(2)}`)
              .replace('{date}', summary.date)}
          </Typography>

          {droppedTotal > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', fontWeight: 600 }}>
                {t('monitoring.stageTelemetry.summary').replace('{dropped}', String(droppedTotal))}
              </Typography>
              {Object.entries(summary.stage_telemetry?.per_stage ?? {}).map(([stageName, stats]) => (
                stats.dropped > 0 ? (
                  <StageDropRow key={stageName} stageName={stageName} stats={stats} t={t} />
                ) : null
              ))}
            </Box>
          )}

          {summary.latency && Object.keys(summary.latency).length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
                Latency (since process start)
              </Typography>
              {Object.entries(summary.latency).map(([metricName, stats]) => (
                (stats?.count ?? 0) > 0 ? (
                  <LatencyRow key={metricName} metricName={metricName} stats={stats} />
                ) : null
              ))}
            </Box>
          )}

          <Stack spacing={0}>
            {(summary.stages ?? []).map((stage) => (
              <StageRow key={stage.id} stage={stage} t={t} />
            ))}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

PipelineStatusPanel.propTypes = {
  data: PropTypes.object,
  loading: PropTypes.bool,
  error: PropTypes.string,
  defaultOpen: PropTypes.bool,
};
