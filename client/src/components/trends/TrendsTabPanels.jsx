import { useCallback } from 'react';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ChartCard, ChartGrid, KpiCard, KpiStrip, SectionHeading } from '../../ui/index.js';
import { districtDisplayName } from '../../lib/israelDistricts.js';

export function Sparkline({ values, color }) {
  const max = Math.max(...(values ?? []), 1);
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.25, height: 28 }}>
      {(values ?? []).map((v, i) => (
        <Box
          key={i}
          sx={{
            width: 4,
            height: `${Math.max(8, (v / max) * 100)}%`,
            bgcolor: color,
            borderRadius: 0.5,
            opacity: 0.85,
          }}
        />
      ))}
    </Box>
  );
}

export function AttentionSummaryPanel({ attention, districtName, t }) {
  if (!attention) return null;
  const changeStr =
    attention.changePct != null
      ? `${attention.changePct > 0 ? '+' : ''}${attention.changePct}%`
      : '—';
  let nationalStr = t('trends.attention.nationalAligned');
  if (attention.vsNationalDelta != null) {
    if (attention.vsNationalDelta >= 8) {
      nationalStr = t('trends.attention.nationalAbove').replace('{n}', String(attention.vsNationalDelta));
    } else if (attention.vsNationalDelta <= -8) {
      nationalStr = t('trends.attention.nationalBelow').replace('{n}', String(Math.abs(attention.vsNationalDelta)));
    }
  }

  return (
    <Card
      sx={(theme) => ({
        p: 2,
        border: theme.custom.border.hairline,
        bgcolor: theme.palette.background.paper,
      })}
    >
      <Typography variant="eyebrow" color="text.secondary" sx={{ mb: 1 }}>
        {t('trends.attention.title')}
      </Typography>
      <KpiStrip columns={3}>
        <KpiCard label={t('trends.attention.indexLabel')} value={attention.index} />
        <KpiCard label={t('trends.attention.changeLabel')} value={changeStr} />
        <KpiCard
          label={t('trends.attention.vsNationalLabel')}
          value={
            attention.vsNationalDelta != null
              ? (attention.vsNationalDelta > 0 ? `+${attention.vsNationalDelta}` : String(attention.vsNationalDelta))
              : '—'
          }
        />
      </KpiStrip>
      <Typography variant="body1" sx={{ mt: 1.5, fontWeight: 500 }}>
        {t('trends.attention.line')
          .replace('{district}', districtName)
          .replace('{index}', String(attention.index))
          .replace('{change}', changeStr)}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {nationalStr}
      </Typography>
    </Card>
  );
}

function directionChipColor(direction, theme) {
  if (direction === 'support') return theme.palette.score?.good?.main ?? theme.palette.success.main;
  if (direction === 'pressure') return theme.palette.score?.alert?.main ?? theme.palette.warning.main;
  return theme.palette.text.secondary;
}

export function ComponentMapPanel({ rows, t, chartColor }) {
  const theme = useTheme();
  if (!rows?.length) return null;

  const visible = rows.filter((row) => (row.sai ?? row.latest ?? 0) > 0 || (row.topSignals?.length ?? 0) > 0);

  return (
    <>
      <SectionHeading>{t('trends.components.title')}</SectionHeading>
      <Typography variant="body2" color="text.secondary" sx={{ mt: -1.5, mb: 1 }}>
        {t('trends.components.proxyDisclaimer')}
      </Typography>
      <ChartGrid minColumnWidth={260}>
        {visible.map((row) => {
          const sai = row.sai ?? row.latest ?? 0;
          const dir = row.direction ?? 'mixed';
          const signalHint = (row.topSignals ?? [])
            .slice(0, 2)
            .map((s) => {
              const key = `trends.signal.${s.type}`;
              const label = t(key);
              return label !== key ? label : s.type.replace(/_/g, ' ');
            })
            .join(' · ');

          return (
            <ChartCard key={row.componentId} title={t(row.labelKey)}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap" useFlexGap>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('trends.components.saiLabel')}
                  </Typography>
                  <Typography variant="kpiValue">{sai}</Typography>
                </Box>
                <Chip
                  size="small"
                  label={t(`trends.components.direction.${dir}`)}
                  sx={{
                    bgcolor: directionChipColor(dir, theme),
                    color: theme.palette.common.white,
                    fontWeight: 600,
                  }}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {row.changePct != null
                  ? `${row.changePct > 0 ? '+' : ''}${row.changePct}%`
                  : '—'}
              </Typography>
              <Sparkline values={row.sparkline} color={chartColor} />
              <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5} sx={{ mt: 1 }}>
                <Chip size="small" variant="outlined" label={t(`trends.band.${row.band}`)} />
              </Stack>
              {signalHint && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                  {signalHint}
                </Typography>
              )}
            </ChartCard>
          );
        })}
      </ChartGrid>
    </>
  );
}

export function DistrictComparisonPanel({ comparison, t, onSelectDistrict, chartColors }) {
  if (!comparison) return null;
  const { leaders, laggards, spreadVsNational } = comparison;

  return (
    <>
      <SectionHeading>{t('trends.districtCompare.title')}</SectionHeading>
      <ChartGrid minColumnWidth={280}>
        <ChartCard title={t('trends.districtCompare.leaders')}>
          <Stack spacing={0.75}>
            {(leaders ?? []).map((r) => (
              <Stack key={r.districtId ?? r.labelKey} direction="row" justifyContent="space-between">
                <Button
                  size="small"
                  variant="text"
                  sx={{ textTransform: 'none', p: 0, minWidth: 0 }}
                  onClick={() => r.districtId && onSelectDistrict?.(r.districtId)}
                >
                  {districtDisplayName(t, r.labelKey ?? r.districtId)}
                </Button>
                <Typography variant="body2" fontWeight={600}>{r.value}</Typography>
              </Stack>
            ))}
          </Stack>
        </ChartCard>
        <ChartCard title={t('trends.districtCompare.laggards')}>
          <Stack spacing={0.75}>
            {(laggards ?? []).map((r) => (
              <Stack key={r.districtId ?? r.labelKey} direction="row" justifyContent="space-between">
                <Button
                  size="small"
                  variant="text"
                  sx={{ textTransform: 'none', p: 0, minWidth: 0 }}
                  onClick={() => r.districtId && onSelectDistrict?.(r.districtId)}
                >
                  {districtDisplayName(t, r.labelKey ?? r.districtId)}
                </Button>
                <Typography variant="body2" fontWeight={600}>{r.value}</Typography>
              </Stack>
            ))}
          </Stack>
        </ChartCard>
        {spreadVsNational != null && (
          <ChartCard title={t('trends.districtCompare.spread')}>
            <Typography variant="kpiValue">
              {spreadVsNational > 0 ? `+${spreadVsNational}` : spreadVsNational}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('trends.districtCompare.spreadHint')}
            </Typography>
          </ChartCard>
        )}
      </ChartGrid>
    </>
  );
}

function QueryGroupBlock({ title, groups, t, onSuggest }) {
  const groupOrder = ['emergency', 'services', 'psycho', 'other'];
  return (
    <ChartCard title={title}>
      <Stack spacing={2}>
        {groupOrder.map((gid) => {
          const rows = groups?.[gid] ?? [];
          if (!rows.length) return null;
          return (
            <Box key={gid}>
              <Typography variant="eyebrow" color="text.secondary" sx={{ mb: 0.5 }}>
                {gid === 'other' ? t('trends.queries.other') : t(`trends.group.${gid}`)}
              </Typography>
              <Stack spacing={0.75} component="ul" sx={{ m: 0, pl: 2 }}>
                {rows.map((row) => (
                  <Typography key={row.query} component="li" variant="body2">
                    <Box component="span" sx={{ fontWeight: 500 }}>{row.query}</Box>
                    {' '}
                    <Chip
                      size="small"
                      variant="outlined"
                      label={t(`trends.queries.momentum.${row.momentum}`)}
                      sx={{ ml: 0.5, verticalAlign: 'middle' }}
                    />
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                      {row.formattedValue}
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      sx={{ ml: 1, minWidth: 0, p: 0, textDecoration: 'underline' }}
                      onClick={() => onSuggest(row.query)}
                    >
                      {t('trends.queries.suggest')}
                    </Button>
                  </Typography>
                ))}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </ChartCard>
  );
}

export function QueriesIntelPanel({ queriesIntel, t }) {
  const onSuggest = useCallback((query) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(query);
    }
  }, []);

  if (!queriesIntel) return null;

  const hasPopular = Object.values(queriesIntel.popularByGroup ?? {}).some((a) => a?.length);
  const hasRising = Object.values(queriesIntel.risingByGroup ?? {}).some((a) => a?.length);
  if (!hasPopular && !hasRising) return null;

  return (
    <>
      <SectionHeading>{t('trends.queries.intelTitle')}</SectionHeading>
      <ChartGrid minColumnWidth={320}>
        {hasPopular && (
          <QueryGroupBlock
            title={t('trends.chart.popular')}
            groups={queriesIntel.popularByGroup}
            t={t}
            onSuggest={onSuggest}
          />
        )}
        {hasRising && (
          <QueryGroupBlock
            title={t('trends.chart.rising')}
            groups={queriesIntel.risingByGroup}
            t={t}
            onSuggest={onSuggest}
          />
        )}
      </ChartGrid>
    </>
  );
}

function MiniTopicChart({ local, national, color, nationalColor }) {
  const len = Math.max(local?.length ?? 0, national?.length ?? 0);
  const data = Array.from({ length: len }, (_, i) => ({
    i,
    local: local?.[i] ?? null,
    national: national?.[i] ?? null,
  }));
  return (
    <ResponsiveContainer width="100%" height={72}>
      <LineChart data={data}>
        <YAxis domain={[0, 100]} hide />
        <Line type="monotone" dataKey="local" stroke={color} strokeWidth={2} dot={false} connectNulls />
        <Line type="monotone" dataKey="national" stroke={nationalColor} strokeWidth={1.5} dot={false} strokeDasharray="4 3" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TopicDeepDivePanel({ dives, t, chartColor, nationalColor }) {
  if (!dives?.length) return null;
  return (
    <>
      <SectionHeading>{t('trends.deepDive.title')}</SectionHeading>
      <ChartGrid minColumnWidth={280}>
        {dives.map((d) => (
          <ChartCard key={d.topicId} title={t(d.labelKey)}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="kpiValue">{d.latest}</Typography>
              <Chip size="small" label={t(`trends.band.${d.band}`)} variant="outlined" />
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              {t('trends.deepDive.legendLocal')} · {t('trends.deepDive.legendNational')}
            </Typography>
            <MiniTopicChart
              local={d.sparklineLocal}
              national={d.sparklineNational}
              color={chartColor}
              nationalColor={nationalColor}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t(`trends.deepDive.interpret.${d.band}`)}
            </Typography>
          </ChartCard>
        ))}
      </ChartGrid>
    </>
  );
}
