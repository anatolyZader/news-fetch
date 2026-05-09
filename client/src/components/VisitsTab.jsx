import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import {
  EmptyState,
  ErrorState,
  FilterBar,
  FilterPill,
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

/** Use only the part after the first colon (trimmed); otherwise the whole string. */
function valueAfterFirstColon(s) {
  const t = String(s ?? '').trim();
  const i = t.indexOf(':');
  if (i === -1) return t;
  return t.slice(i + 1).trim();
}

/** Text after first `: ` in evidence (location line stripped); whole string if no colon. */
function signalEvidenceExplanation(evidence) {
  if (evidence == null || String(evidence).trim() === '') return '';
  return valueAfterFirstColon(evidence);
}

function formatPublished(ts, formatDateFn) {
  if (!ts || typeof ts !== 'string') return null;
  const datePart = ts.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return formatDateFn(datePart);
  return ts;
}

/** Inset panel: white panels on the content well; border + shadow so they read clearly above the tray. */
function visitInsetPanelSx(theme, accent) {
  return {
    borderRadius: theme.custom.radius.sm,
    bgcolor: 'background.paper',
    border: `1px solid ${alpha(accent, 0.3)}`,
    boxShadow: `0 1px 2px ${alpha(theme.palette.common.black, 0.06)}, 0 2px 8px ${alpha(theme.palette.common.black, 0.05)}`,
  };
}

function VisitMetaRow({ label, value }) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return (
    <Box
      role="listitem"
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'minmax(140px, 0.36fr) minmax(0, 1fr)' },
        columnGap: theme.spacing(2),
        rowGap: { xs: theme.spacing(0.35), sm: 0 },
        alignItems: 'baseline',
        py: 1.35,
        borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
        '&:last-of-type': {
          borderBottom: 'none',
          pb: 0,
        },
        '&:first-of-type': { pt: 0 },
      })}
    >
      <Typography
        component="div"
        variant="caption"
        color="text.secondary"
        fontWeight={700}
        sx={{ letterSpacing: '0.02em' }}
      >
        {label}
      </Typography>
      <Typography
        component="div"
        variant="body2"
        dir="auto"
        sx={{
          lineHeight: 1.6,
          wordBreak: 'break-word',
          minWidth: 0,
          textAlign: 'end',
          justifySelf: 'end',
          width: '100%',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function VisitSubsection({ title, children, theme }) {
  const accent = theme.palette.primary.main;
  return (
    <Stack spacing={1.5}>
      {title ? (
        <Typography
          component="h4"
          sx={{
            ...theme.typography.eyebrow,
            color: accent,
            m: 0,
            paddingBottom: 0.5,
            borderBottom: `1px solid ${alpha(accent, 0.18)}`,
          }}
        >
          {title}
        </Typography>
      ) : null}
      <Box sx={{ minWidth: 0 }}>{children}</Box>
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

  const accent = theme.palette.primary.main;
  const ink = theme.palette.text.primary;
  return (
    <Card
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        borderColor: alpha(accent, 0.35),
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: theme.custom.radius.md,
        overflow: 'hidden',
        boxShadow: `0 2px 6px ${alpha(ink, 0.06)}, 0 8px 24px ${alpha(ink, 0.07)}`,
      }}
    >
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          py: 2,
          background: theme.custom.surface.bannerSubtle,
          borderBottom: `1px solid ${alpha(accent, 0.12)}`,
          borderInlineStart: '3px solid',
          borderInlineStartColor: 'primary.main',
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

      <CardContent
        sx={{
          p: { xs: 2, sm: 2.5 },
          bgcolor: alpha(accent, 0.1),
          '&:last-child': { pb: { xs: 2, sm: 2.5 } },
        }}
      >
        <Stack spacing={2.75}>
          <VisitSubsection title={t('visit.card.overview')} theme={theme}>
            <Box
              component="section"
              role="list"
              aria-label={t('visit.card.overview')}
              sx={{
                m: 0,
                p: { xs: 1.5, sm: 2 },
                ...visitInsetPanelSx(theme, accent),
              }}
            >
              <VisitMetaRow label={t('visit.card.recordIndex')} value={visit.articleIndex != null ? `#${visit.articleIndex}` : null} />
              <VisitMetaRow label={t('visit.card.municipality')} value={visit.municipality} />
              <VisitMetaRow label={t('visit.card.region')} value={visit.region} />
              <VisitMetaRow label={t('visit.card.visitDate')} value={visitDateLabel} />
              <VisitMetaRow label={t('visit.card.squad')} value={visit.source} />
              <VisitMetaRow label={t('visit.card.published')} value={publishedLabel} />
            </Box>
          </VisitSubsection>

          {visit.stakeholders ? (
            <VisitSubsection title={t('visit.card.stakeholders')} theme={theme}>
              <Box
                dir="auto"
                sx={{
                  p: 1.75,
                  ...visitInsetPanelSx(theme, accent),
                }}
              >
                <Typography variant="body2" sx={{ lineHeight: 1.65 }}>
                  {visit.stakeholders}
                </Typography>
              </Box>
            </VisitSubsection>
          ) : null}

          <VisitSubsection title={t('visit.card.fieldNotes')} theme={theme}>
            {noteBody ? (
              <Box
                dir="auto"
                sx={{
                  p: 1.75,
                  ...visitInsetPanelSx(theme, accent),
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
                    paddingInlineStart: theme.spacing(2.5),
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

          <VisitSubsection theme={theme}>
            {signalsSorted.length > 0 ? (
              <Stack component="ul" spacing={1.25} sx={{ m: 0, p: 0, listStyle: 'none' }}>
                {signalsSorted.map((sig, idx) => {
                  const label = typeLabel(sig.signal_type);
                  const explanation = signalEvidenceExplanation(sig.evidence);
                  return (
                    <Box
                      component="li"
                      key={`${sig.signal_type}-${idx}-${String(sig.evidence).slice(0, 24)}`}
                      sx={{
                        listStyle: 'none',
                        p: 1.5,
                        ...visitInsetPanelSx(theme, accent),
                        borderInlineStartWidth: 4,
                        borderInlineStartColor: 'primary.main',
                      }}
                    >
                      <Typography variant="body2" dir="auto" sx={{ lineHeight: 1.65 }}>
                        <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>
                          {'\u2022 '}
                          {label}
                        </Box>
                      </Typography>
                      {explanation ? (
                        <Typography
                          variant="body2"
                          dir="auto"
                          sx={{
                            lineHeight: 1.65,
                            mt: 0.5,
                            paddingInlineStart: 2,
                          }}
                        >
                          {explanation}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, paddingInlineStart: 2 }}>
                          —
                        </Typography>
                      )}
                    </Box>
                  );
                })}
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, pb: 2 }}>
      <PageHeader
        title={t('visit.title')}
        subtitle={t('visit.subtitle')}
      />

      <KpiStrip>
        {kpis.map((kpi) => <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} />)}
      </KpiStrip>

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
