import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useTheme } from '@mui/material/styles';

import { useResilienceDrift } from '../hooks/useResilienceDrift.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { scoreColor10 } from '../lib/score.js';

const COMPONENT_IDS = [
  'narrative', 'information_communication', 'lifesaving_behavior',
  'functional_continuity', 'community_capital', 'leadership',
  'belonging_solidarity', 'wellbeing_atrisk',
];

function Sparkline({ series, t, valueKey = 'score', variant = 'score10' }) {
  const theme = useTheme();
  const W = 240;
  const H = 60;
  const padX = 4;
  const padY = 6;
  const points = series
    .map((p, i) => ({ x: i, y: p[valueKey], date: p.date }))
    .filter((p) => p.y != null && !Number.isNaN(p.y));

  if (points.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
        {t('drift.noData')}
      </Typography>
    );
  }

  const xMax = Math.max(1, series.length - 1);
  const yMin = variant === 'unit01' ? 0 : 1;
  const yMax = variant === 'unit01' ? 1 : 10;

  function sx(x) { return padX + (x / xMax) * (W - 2 * padX); }
  function sy(y) { return H - padY - ((y - yMin) / (yMax - yMin)) * (H - 2 * padY); }

  const polyline = points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const lastColor = variant === 'unit01'
    ? theme.palette.primary.main
    : scoreColor10(last.y, theme);

  return (
    <Box sx={{ position: 'relative', width: W, height: H }}>
      <svg width={W} height={H} role="img" aria-label="score sparkline">
        <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke={theme.palette.divider} strokeWidth={1} />
        <line x1={padX} y1={padY} x2={padX} y2={H - padY} stroke={theme.palette.divider} strokeWidth={1} />
        <polyline
          points={polyline}
          fill="none"
          stroke={theme.palette.text.secondary}
          strokeWidth={1.5}
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={sx(p.x)} cy={sy(p.y)}
            r={2.5}
            fill={variant === 'unit01' ? theme.palette.text.secondary : scoreColor10(p.y, theme)}
          />
        ))}
        <circle cx={sx(last.x)} cy={sy(last.y)} r={4} fill={lastColor} />
      </svg>
      <Stack
        direction="row" justifyContent="space-between"
        sx={{ position: 'absolute', bottom: -2, left: 0, right: 0, paddingLeft: 0.5, paddingRight: 0.5 }}
      >
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
          {first.date}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
          {last.date}
        </Typography>
      </Stack>
    </Box>
  );
}

function ComponentTile({ id, series, t }) {
  const last = [...series].reverse().find((p) => p.score != null);
  const first = series.find((p) => p.score != null);
  const change = (last && first && last !== first)
    ? last.score - first.score
    : null;

  return (
    <Box sx={(theme) => ({
      padding: theme.spacing(1.5),
      border: theme.custom.border.hairline,
      borderRadius: theme.custom.radius.sm,
      background: theme.palette.background.paper,
      minWidth: 260,
    })}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography variant="cardTitle" sx={{ textTransform: 'capitalize' }}>
          {t(`comp.${id}`) ?? id.replace(/_/g, ' ')}
        </Typography>
        <Stack direction="row" spacing={0.75} alignItems="baseline">
          {last && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {last.score}/10
            </Typography>
          )}
          {change != null && change !== 0 && (
            <Typography
              variant="caption"
              sx={(theme) => ({
                color: change > 0 ? theme.palette.success.main : theme.palette.error.main,
                fontWeight: 600,
              })}
            >
              {change > 0 ? '+' : ''}{change}
            </Typography>
          )}
        </Stack>
      </Stack>
      <Box sx={{ marginTop: 0.5 }}>
        <Sparkline series={series} t={t} />
      </Box>
    </Box>
  );
}

function OverridesBar({ overrides, t }) {
  if (!overrides) return null;
  const total = overrides.total ?? 0;
  const rate = overrides.rate ?? 0;
  return (
    <Box sx={(theme) => ({
      padding: theme.spacing(2),
      border: theme.custom.border.hairline,
      borderRadius: theme.custom.radius.sm,
      background: theme.palette.background.paper,
    })}>
      <Typography variant="cardTitle" sx={{ marginBottom: 0.5 }}>
        {t('drift.overrideRate')}
      </Typography>
      <Stack direction="row" spacing={2} sx={{ marginBottom: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {t('drift.overrides.total').replace('{n}', String(total))}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('drift.overrides.rate').replace('{rate}', (rate * 100).toFixed(1))}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, rate * 100)}
        sx={{ height: 6, borderRadius: 3 }}
      />
    </Box>
  );
}

function SignalVolumeBar({ days, t }) {
  if (!Array.isArray(days) || days.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: 'text.disabled' }}>{t('drift.noData')}</Typography>
    );
  }
  const max = Math.max(...days.map((d) => d.total), 1);
  return (
    <Box sx={(theme) => ({
      padding: theme.spacing(2),
      border: theme.custom.border.hairline,
      borderRadius: theme.custom.radius.sm,
      background: theme.palette.background.paper,
    })}>
      <Typography variant="cardTitle" sx={{ marginBottom: 1 }}>
        {t('drift.signalVolume')}
      </Typography>
      <Stack direction="row" alignItems="flex-end" spacing={0.25} sx={{ height: 80 }}>
        {days.map((d, i) => (
          <Box
            key={i}
            title={`${d.date}: ${d.total}`}
            sx={(theme) => ({
              flex: 1,
              minWidth: 4,
              height: `${(d.total / max) * 100}%`,
              background: theme.palette.primary.main,
              opacity: 0.55,
              borderRadius: 1,
            })}
          />
        ))}
      </Stack>
    </Box>
  );
}

export function ResilienceDriftPanel({ scope = 'national' }) {
  const { t } = useLanguage();
  const [days, setDays] = useState(30);
  const { data, loading, error } = useResilienceDrift({ scope, days });

  const perComponent = useMemo(() => data?.per_component ?? {}, [data]);

  return (
    <Stack spacing={3}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="panelTitle" component="h2">
          {t('drift.title')}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={days}
          onChange={(_, v) => v && setDays(v)}
        >
          {[7, 14, 30].map((d) => (
            <ToggleButton key={d} value={d}>
              {t('drift.window').replace('{n}', String(d))}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {loading && <LinearProgress />}

      {!loading && !error && data && (
        <>
          <Box sx={(theme) => ({
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: theme.spacing(2),
          })}>
            {COMPONENT_IDS.map((id) => (
              <ComponentTile
                key={id}
                id={id}
                series={perComponent[id]?.series ?? []}
                t={t}
              />
            ))}
          </Box>

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
          >
            <Box sx={{ flex: 1 }}>
              <SignalVolumeBar days={data.signal_volume_per_day} t={t} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <OverridesBar overrides={data.overrides} t={t} />
            </Box>
          </Stack>

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={(theme) => ({ marginTop: theme.spacing(0.5) })}
          >
            <Box sx={(theme) => ({
              flex: 1,
              padding: theme.spacing(2),
              border: theme.custom.border.hairline,
              borderRadius: theme.custom.radius.sm,
              background: theme.palette.background.paper,
            })}>
              <Typography variant="cardTitle" sx={{ marginBottom: 1 }}>
                {t('drift.meanPolarization')}
              </Typography>
              <Sparkline
                variant="unit01"
                valueKey="mean"
                series={data.daily_mean_polarization ?? []}
                t={t}
              />
            </Box>
            <Box sx={(theme) => ({
              flex: 1,
              padding: theme.spacing(2),
              border: theme.custom.border.hairline,
              borderRadius: theme.custom.radius.sm,
              background: theme.palette.background.paper,
            })}>
              <Typography variant="cardTitle" sx={{ marginBottom: 1 }}>
                {t('drift.meanCertainty')}
              </Typography>
              <Sparkline
                variant="unit01"
                valueKey="mean"
                series={data.daily_mean_certainty ?? []}
                t={t}
              />
            </Box>
          </Stack>

          {Array.isArray(data.alerts) && data.alerts.length > 0 && (
            <Box>
              <Typography variant="cardTitle" sx={{ marginBottom: 1 }}>
                {t('drift.alertsTitle')}
              </Typography>
              <Stack spacing={1}>
                {data.alerts.map((a, i) => (
                  <Alert key={i} severity={a.level === 'error' ? 'error' : 'warning'}>
                    {a.message}
                  </Alert>
                ))}
              </Stack>
              <Typography
                variant="eyebrow"
                component="div"
                sx={(theme) => ({
                  marginTop: theme.spacing(1),
                  color: 'text.disabled',
                })}
              >
                <strong>{t('drift.alerts.helpHeader')}:</strong> {t('drift.alerts.helpBody')}
              </Typography>
            </Box>
          )}
        </>
      )}

      {!loading && !error && data && data.dates.length === 0 && (
        <Alert severity="info">{t('drift.noData')}</Alert>
      )}
    </Stack>
  );
}
