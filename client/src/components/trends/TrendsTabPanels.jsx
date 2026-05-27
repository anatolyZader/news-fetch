import { useCallback } from 'react';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChartCard, ChartGrid, SectionHeading } from '../../ui/index.js';
import PropTypes from 'prop-types';
import { translationFnPropType } from '../../lib/reportPropTypes.js';

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

QueryGroupBlock.propTypes = {
  title: PropTypes.string.isRequired,
  groups: PropTypes.object,
  t: translationFnPropType,
  onSuggest: PropTypes.func.isRequired,
};

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

QueriesIntelPanel.propTypes = {
  queriesIntel: PropTypes.object,
  t: translationFnPropType,
};

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

MiniTopicChart.propTypes = {
  local: PropTypes.arrayOf(PropTypes.number),
  national: PropTypes.arrayOf(PropTypes.number),
  color: PropTypes.string,
  nationalColor: PropTypes.string,
};

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

TopicDeepDivePanel.propTypes = {
  dives: PropTypes.arrayOf(PropTypes.object),
  t: translationFnPropType,
  chartColor: PropTypes.string,
  nationalColor: PropTypes.string,
};
