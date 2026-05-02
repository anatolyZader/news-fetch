import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import {
  EmptyState,
  ErrorState,
  FilterBar,
  FilterPill,
  GridTable,
  KpiCard,
  KpiStrip,
  LoadingState,
  PageHeader,
  SectionHeading,
} from '../ui/index.js';
import { formatDate } from '../lib/date.js';

function dateRangeLabel(range) {
  if (!range) return '—';
  return `${formatDate(range.from)} – ${formatDate(range.to)}`;
}

function typeLabel(type) {
  return String(type ?? 'unknown').replace(/_/g, ' ');
}

function formatPublished(ts, formatDateFn) {
  if (!ts || typeof ts !== 'string') return null;
  const datePart = ts.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return formatDateFn(datePart);
  return ts;
}

function VisitMetaItem({ label, value }) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return (
    <Stack spacing={0.35}>
      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: '0.02em' }}>
        {label}
      </Typography>
      <Typography variant="body2" dir="auto" sx={{ lineHeight: 1.55 }}>
        {value}
      </Typography>
    </Stack>
  );
}

function VisitSubsection({ title, children, theme }) {
  return (
    <Stack spacing={1.25}>
      <Typography
        component="h4"
        sx={{
          ...theme.typography.eyebrow,
          color: 'text.secondary',
          m: 0,
        }}
      >
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

function VisitMunicipalityCard({
  visit,
  batchDate,
  t,
  formatDate,
}) {
  const theme = useTheme();
  const visitDateLabel = formatDate(visit.visitDate || batchDate);
  const publishedLabel = formatPublished(visit.published, formatDate);
  const signalsSorted = useMemo(() => {
    const raw = visit.signals ?? [];
    return [...raw].sort((a, b) => {
      const tya = String(a.signal_type ?? '');
      const tyb = String(b.signal_type ?? '');
      if (tya !== tyb) return tya.localeCompare(tyb);
      return String(a.evidence ?? '').localeCompare(String(b.evidence ?? ''), undefined, { sensitivity: 'base' });
    });
  }, [visit.signals]);

  const noteBody = String(visit.notes ?? '').trim();
  const hasSignals = (visit.signalCount ?? 0) > 0;

  return (
    <Card
      elevation={0}
      sx={{
        border: theme.custom.border.hairline,
        borderRadius: theme.shape.borderRadius * 1.25,
        overflow: 'hidden',
        boxShadow: theme.custom.elevation.subtle,
      }}
    >
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          py: 2,
          background: theme.custom.surface.bannerSubtle,
          borderBottom: theme.custom.border.hairline,
        }}
      >
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} useFlexGap flexWrap="wrap">
          <Stack spacing={0.75} sx={{ minWidth: 0, flex: '1 1 200px' }}>
            <Typography variant="h3" component="h3" dir="auto" sx={{ wordBreak: 'break-word', lineHeight: 1.35 }}>
              {visit.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" dir="auto">
              {visitDateLabel}
              <Box component="span" sx={{ mx: 0.75, opacity: 0.45 }}>
                ·
              </Box>
              {visit.source || t('visit.unknownSource')}
            </Typography>
          </Stack>
          <Chip
            size="small"
            color={hasSignals ? 'primary' : 'default'}
            variant={hasSignals ? 'filled' : 'outlined'}
            label={`${visit.signalCount ?? 0} ${t('visit.signals')}`}
            sx={{ fontWeight: 600, flexShrink: 0 }}
          />
        </Stack>
      </Box>

      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
        <Stack spacing={2.75} divider={<Divider flexItem sx={{ borderStyle: 'dashed' }} />}>
          <VisitSubsection title={t('visit.card.overview')} theme={theme}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 2,
                p: 1.75,
                borderRadius: theme.shape.borderRadius,
                bgcolor: theme.custom.surface.muted,
                border: theme.custom.border.hairline,
              }}
            >
              <VisitMetaItem label={t('visit.card.recordIndex')} value={visit.articleIndex != null ? `#${visit.articleIndex}` : null} />
              <VisitMetaItem label={t('visit.card.municipality')} value={visit.municipality} />
              <VisitMetaItem label={t('visit.card.region')} value={visit.region} />
              <VisitMetaItem label={t('visit.card.visitDate')} value={visitDateLabel} />
              <VisitMetaItem label={t('visit.card.squad')} value={visit.source} />
              <VisitMetaItem label={t('visit.card.published')} value={publishedLabel} />
            </Box>
          </VisitSubsection>

          {visit.stakeholders ? (
            <VisitSubsection title={t('visit.card.stakeholders')} theme={theme}>
              <Typography variant="body2" dir="auto" sx={{ lineHeight: 1.65 }}>
                {visit.stakeholders}
              </Typography>
            </VisitSubsection>
          ) : null}

          <VisitSubsection title={t('visit.card.fieldNotes')} theme={theme}>
            {noteBody ? (
              <Box
                dir="auto"
                sx={{
                  p: 1.75,
                  borderRadius: theme.shape.borderRadius,
                  bgcolor: theme.custom.surface.code,
                  border: theme.custom.border.hairline,
                  whiteSpace: 'pre-wrap',
                  typography: 'body2',
                  lineHeight: 1.65,
                }}
              >
                {noteBody}
              </Box>
            ) : null}
            {visit.notePoints?.length > 0 ? (
              <Stack spacing={1}>
                {noteBody ? (
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    {t('visit.card.noteHighlights')}
                  </Typography>
                ) : null}
                <Box
                  component="ul"
                  dir="auto"
                  sx={{
                    m: 0,
                    pl: 2.25,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.75,
                  }}
                >
                  {visit.notePoints.map((point, idx) => (
                    <Typography key={idx} component="li" variant="body2" sx={{ lineHeight: 1.55 }}>
                      {point}
                    </Typography>
                  ))}
                </Box>
              </Stack>
            ) : null}
            {!noteBody && !(visit.notePoints?.length > 0) ? (
              <Typography variant="body2" color="text.secondary">
                —
              </Typography>
            ) : null}
          </VisitSubsection>

          {visit.signalTypes?.length > 0 ? (
            <VisitSubsection title={t('visit.card.signalTypes')} theme={theme}>
              <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.75}>
                {visit.signalTypes.map((st) => (
                  <Chip
                    key={st.type}
                    size="small"
                    variant="outlined"
                    color="primary"
                    label={`${typeLabel(st.type)} (${st.count})`}
                  />
                ))}
              </Stack>
            </VisitSubsection>
          ) : null}

          <VisitSubsection title={t('visit.card.signalsTitle')} theme={theme}>
            {signalsSorted.length > 0 ? (
              <Stack spacing={1.25}>
                {signalsSorted.map((sig, idx) => (
                  <Box
                    key={`${sig.signal_type}-${idx}-${String(sig.evidence).slice(0, 24)}`}
                    sx={{
                      p: 1.5,
                      borderRadius: theme.shape.borderRadius,
                      bgcolor: 'background.paper',
                      border: theme.custom.border.hairline,
                      borderLeftWidth: 4,
                      borderLeftColor: 'primary.main',
                      boxShadow: theme.custom.elevation.subtle,
                    }}
                  >
                    <Stack spacing={1}>
                      <Chip size="small" label={typeLabel(sig.signal_type)} color="primary" variant="outlined" sx={{ alignSelf: 'flex-start' }} />
                      {sig.evidence ? (
                        <Typography variant="body2" dir="auto" sx={{ lineHeight: 1.65 }}>
                          {sig.evidence}
                        </Typography>
                      ) : null}
                      {sig.evidence_type || sig.scope_level || sig.article_source ? (
                        <Box component="ul" sx={{ m: 0, pl: 2.25, listStyle: 'disc', '& li': { display: 'list-item' } }}>
                          {sig.evidence_type ? (
                            <Typography component="li" variant="caption" color="text.secondary">
                              <Box component="span" fontWeight={700}>{t('visit.card.evidenceType')}: </Box>
                              {sig.evidence_type}
                            </Typography>
                          ) : null}
                          {sig.scope_level ? (
                            <Typography component="li" variant="caption" color="text.secondary">
                              <Box component="span" fontWeight={700}>{t('visit.card.scope')}: </Box>
                              {sig.scope_level}
                            </Typography>
                          ) : null}
                          {sig.article_source ? (
                            <Typography component="li" variant="caption" color="text.secondary" dir="auto">
                              <Box component="span" fontWeight={700}>{t('visit.card.signalSource')}: </Box>
                              {sig.article_source}
                            </Typography>
                          ) : null}
                        </Box>
                      ) : null}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t('visit.card.noSignalsBody')}
              </Typography>
            )}
          </VisitSubsection>
        </Stack>
      </CardContent>
    </Card>
  );
}

function compareVisitByRegionThenMunicipality(a, b) {
  const regionCmp = (a.region ?? '').localeCompare(b.region ?? '', 'he', { sensitivity: 'base' });
  if (regionCmp !== 0) return regionCmp;
  return (a.municipality ?? '').localeCompare(b.municipality ?? '', 'he', { sensitivity: 'base' });
}

export function VisitsTab() {
  const { getIdToken, apiReady } = useAuth();
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [muniFilter, setMuniFilter] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch('/api/visits', { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setData(json);
      if (json.days?.length) {
        const latestWithVisits = [...json.days].reverse().find((day) => day.visitCount > 0);
        setSelectedDate((latestWithVisits ?? json.days[json.days.length - 1]).date);
      }
    } catch (e) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (apiReady) void load();
  }, [apiReady, load]);

  const selectedDay = useMemo(() => {
    if (!data?.days || !selectedDate) return null;
    return data.days.find((day) => day.date === selectedDate) ?? null;
  }, [data, selectedDate]);

  const visibleVisits = useMemo(() => {
    const visits = selectedDay?.visits ?? [];
    const filtered =
      muniFilter.size === 0 ? visits : visits.filter((visit) => muniFilter.has(visit.municipality));
    return [...filtered].sort(compareVisitByRegionThenMunicipality);
  }, [muniFilter, selectedDay]);

  function toggleMuni(municipality) {
    setMuniFilter((prev) => {
      const next = new Set(prev);
      next.has(municipality) ? next.delete(municipality) : next.add(municipality);
      return next;
    });
  }

  if (loading) return <LoadingState>{t('visit.loading')}</LoadingState>;
  if (error) return <ErrorState>{`${t('visit.error')}: ${error}`}</ErrorState>;
  if (!data?.days?.length) return <EmptyState>{t('visit.noData')}</EmptyState>;

  const summary = data.summary ?? {};
  const kpis = [
    { label: t('visit.kpi.totalVisits'), value: summary.totalVisits ?? 0 },
    { label: t('visit.kpi.municipalities'), value: summary.totalMunicipalities ?? 0 },
    { label: t('visit.kpi.signals'), value: summary.totalSignals ?? 0 },
    { label: t('visit.kpi.dateRange'), value: dateRangeLabel(summary.dateRange) },
  ];
  const topSignalTypes = (data.signalTypes ?? []).slice(0, 8);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, pb: 2 }}>
      <PageHeader
        title={t('visit.title')}
        subtitle={t('visit.subtitle')}
      />

      <KpiStrip>
        {kpis.map((kpi) => <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} />)}
      </KpiStrip>

      <Stack spacing={0.5}>
        <SectionHeading>{t('visit.sec.signalTypes')}</SectionHeading>
        <Typography variant="body2" color="text.secondary">
          {topSignalTypes.length ? t('visit.sec.signalTypesSub') : t('visit.noSignals')}
        </Typography>
      </Stack>
      {topSignalTypes.length > 0 && (
        <GridTable
          rows={topSignalTypes}
          gridTemplateColumns="minmax(0, 1fr) 100px"
          columns={[
            { key: 'type', label: t('visit.col.signalType'), render: (row) => typeLabel(row.type) },
            { key: 'count', label: t('visit.col.count') },
          ]}
        />
      )}

      <FilterBar
        footer={muniFilter.size > 0 ? {
          label: t('visit.filter.clear'),
          onClick: () => setMuniFilter(new Set()),
        } : null}
      >
        <Stack spacing={1}>
          <ToggleButtonGroup
            value={selectedDate}
            exclusive
            size="small"
            onChange={(_, next) => {
              if (next) {
                setSelectedDate(next);
                setMuniFilter(new Set());
              }
            }}
            sx={{ flexWrap: 'wrap' }}
          >
            {data.days.map((day) => (
              <ToggleButton key={day.date} value={day.date}>
                {formatDate(day.date)} ({day.visitCount})
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 0.75,
              minWidth: 0,
              width: '100%',
              maxWidth: '100%',
              overflow: 'hidden',
              '& .MuiChip-root': {
                flexShrink: 0,
              },
              '& .MuiChip-label': {
                whiteSpace: 'nowrap',
              },
            }}
            role="group"
            aria-label={t('visit.filter.municipality')}
          >
            {(selectedDay?.municipalities ?? []).map((municipality) => (
              <FilterPill
                key={municipality}
                active={muniFilter.has(municipality)}
                onClick={() => toggleMuni(municipality)}
              >
                {municipality}
              </FilterPill>
            ))}
          </Box>
        </Stack>
      </FilterBar>

      <Stack spacing={0.5}>
        <SectionHeading>{t('visit.sec.visits')}</SectionHeading>
        <Typography variant="body2" color="text.secondary">
          {t('visit.filter.showing')
            .replace('{n}', visibleVisits.length)
            .replace('{total}', selectedDay?.visits?.length ?? 0)}
        </Typography>
      </Stack>

      <Stack spacing={2}>
        {visibleVisits.map((visit) => (
          <VisitMunicipalityCard
            key={visit.id}
            visit={visit}
            batchDate={selectedDay.date}
            t={t}
            formatDate={formatDate}
          />
        ))}
      </Stack>
    </Box>
  );
}
