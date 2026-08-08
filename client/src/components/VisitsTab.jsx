import { useCallback, useEffect, useMemo, useState } from 'react';
import MenuIcon from '@mui/icons-material/Menu';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LocalizedTextBlock } from './LocalizedTextBlock.jsx';
import {
  EmptyState,
  ErrorState,
  FilterBar,
  KpiCard,
  KpiStrip,
  LoadingState,
  PageHeader,
  SectionHeading,
  dateToggleGridSx,
} from '../ui/index.js';
import { panelSectionRadius } from '../ui/panelChrome.js';
import { formatDate } from '../lib/date.js';
import PropTypes from 'prop-types';
import { translationFnPropType } from '../lib/reportPropTypes.js';
import { withUserDistrictQuery } from '../lib/clampUserDistrictScope.js';
import { withLang } from '../lib/localeFetch.js';
import { authFetch } from '../lib/authFetch.js';
import { DistrictScopeSwitcher } from './DistrictScopeSwitcher.jsx';

function stableHue(input) {
  const s = String(input ?? '');
  let h = 0;
  for (let i = 0; i < s.length; ) {
    const codePoint = s.codePointAt(i) ?? 0;
    h = (h * 31 + codePoint) >>> 0;
    i += codePoint > 0xffff ? 2 : 1;
  }
  return h % 360;
}

function accentFromKey(key) {
  const hue = stableHue(key);
  // Saturated enough to read as "color", still professional.
  return `hsl(${hue} 72% 44%)`;
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

/** Text shown for a signal row: explanation after first colon, or full evidence if that is empty. */
function signalEvidenceDisplay(evidence) {
  const fromColon = signalEvidenceExplanation(evidence);
  if (fromColon) return fromColon;
  return String(evidence ?? '').trim();
}

function formatPublished(ts, formatDateFn) {
  if (!ts || typeof ts !== 'string') return null;
  const datePart = ts.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return formatDateFn(datePart);
  return ts;
}

/** Inset panel: clean, subtle surface inside a card. */
function visitInsetPanelSx(theme, accent) {
  return {
    borderRadius: panelSectionRadius(theme),
    bgcolor: theme.palette.background.paper,
    border: `1px solid ${alpha(accent, 0.28)}`,
    boxShadow: `0 1px 0 ${alpha(theme.palette.common.black, 0.03)}`,
  };
}

function VisitMetaRow({ label, value }) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return (
    <Box
      role="listitem"
      sx={(theme) => ({
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        flexWrap: 'wrap',
        alignItems: { xs: 'flex-start', sm: 'baseline' },
        columnGap: theme.spacing(1.75),
        rowGap: { xs: theme.spacing(0.35), sm: 0 },
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
        sx={{ letterSpacing: '0.02em', flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Typography
        component="div"
        variant="body2"
        sx={{
          lineHeight: 1.6,
          wordBreak: 'break-word',
          minWidth: 0,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

VisitMetaRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
};

function VisitSubsection({ title, children, theme, dense = false, accent = null }) {
  const a = accent ?? theme.palette.primary.main;
  const sp = dense ? 1 : 1.5;
  return (
    <Stack spacing={sp}>
      {title ? (
        <Typography
          component="h4"
          sx={{
            ...theme.typography.eyebrow,
            color: a,
            m: 0,
            fontSize: dense ? '0.68rem' : undefined,
            letterSpacing: dense ? '0.06em' : undefined,
            paddingBottom: dense ? 0.25 : 0.5,
            borderBottom: `1px solid ${alpha(a, 0.32)}`,
          }}
        >
          {title}
        </Typography>
      ) : null}
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Stack>
  );
}

VisitSubsection.propTypes = {
  title: PropTypes.string,
  children: PropTypes.node,
  theme: PropTypes.object.isRequired,
  dense: PropTypes.bool,
  accent: PropTypes.string,
};

function VisitMunicipalityCard({
  visit,
  batchDate,
  t,
  formatDate,
}) {
  const theme = useTheme();
  const { lang } = useLanguage();
  /** Text direction for the whole card follows the app language switcher (not first-strong from content). */
  const presentationDir = lang === 'he' ? 'rtl' : 'ltr';
  const [bodyExpanded, setBodyExpanded] = useState(true);
  const visitBodyId = `visit-card-body-${visit.id.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`;
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

  const parsedHighlightItems = useMemo(() => {
    const items = [];
    let key = 0;
    for (const p of visit.notePoints ?? []) {
      const text = String(p ?? '').trim();
      if (!text) continue;
      items.push({ kind: 'note', key: `n-${key++}`, text });
    }
    for (const sig of signalsSorted) {
      const text = signalEvidenceDisplay(sig.evidence);
      items.push({
        kind: 'signal',
        key: `s-${sig.signal_type}-${key++}-${String(sig.evidence ?? '').slice(0, 24)}`,
        text,
      });
    }
    return items;
  }, [visit.notePoints, signalsSorted]);

  const hasStakeholders = Boolean(visit.stakeholders && String(visit.stakeholders).trim());

  const accent = accentFromKey(visit.municipality || visit.title || visit.id);
  const ink = theme.palette.text.primary;
  return (
    <Card
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        border: `1px solid ${alpha(theme.palette.divider, 0.95)}`,
        borderRadius: panelSectionRadius(theme),
        overflow: 'hidden',
        boxShadow: `0 1px 2px ${alpha(ink, 0.06)}, 0 10px 24px ${alpha(ink, 0.05)}`,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 160ms ease, transform 160ms ease',
        '&:hover': {
          boxShadow: `0 2px 6px ${alpha(ink, 0.08)}, 0 14px 30px ${alpha(ink, 0.07)}`,
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Box
        dir={presentationDir}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 auto',
          minHeight: 0,
          minWidth: 0,
          height: '100%',
        }}
      >
      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          py: 1.5,
          background: `linear-gradient(180deg, ${alpha(accent, 0.22)} 0%, ${alpha(accent, 0.08)} 100%)`,
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
          borderInlineStart: '4px solid',
          borderInlineStartColor: alpha(accent, 0.95),
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} useFlexGap flexWrap="wrap">
          <LocalizedTextBlock
            text={visit.title}
            original={visit.titleOriginal}
            t={t}
            variant="subtitle1"
            component="h3"
            sx={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.25,
              minWidth: 0,
              flex: '1 1 120px',
              fontWeight: 700,
              letterSpacing: '-0.01em',
            }}
            hideToggle
          />
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
            <IconButton
              size="small"
              aria-label={t('visit.card.toggleVisitDetails')}
              aria-expanded={bodyExpanded}
              aria-controls={visitBodyId}
              onClick={() => setBodyExpanded((v) => !v)}
              sx={{
                color: alpha(theme.palette.text.primary, 0.72),
                bgcolor: alpha(theme.palette.common.white, 0.65),
                border: `1px solid ${alpha(theme.palette.divider, 0.9)}`,
                borderRadius: panelSectionRadius(theme),
                '&:hover': {
                  bgcolor: alpha(theme.palette.common.white, 0.9),
                  color: alpha(theme.palette.text.primary, 0.9),
                },
              }}
            >
              <MenuIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
      </Box>

      <Collapse in={bodyExpanded} timeout="auto" id={visitBodyId} sx={{ flex: '1 1 auto', minWidth: 0 }}>
        <CardContent
          sx={{
            p: { xs: 1.5, sm: 2 },
            bgcolor: alpha(accent, 0.1),
            flex: '1 1 auto',
            '&:last-child': { pb: { xs: 1.5, sm: 2 } },
          }}
        >
          <Box
            sx={{
              containerType: 'inline-size',
              containerName: 'visit',
              display: 'grid',
              gap: 1.25,
              alignItems: 'stretch',
              gridTemplateColumns: 'minmax(0, 1fr)',
              '@container visit (min-width: 400px)': {
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                gridTemplateRows: hasStakeholders ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)',
              },
            }}
          >
            <Box
              sx={{
                minWidth: 0,
                '@container visit (min-width: 400px)': {
                  gridColumn: 1,
                  gridRow: '1 / -1',
                },
              }}
            >
              <VisitSubsection title={t('visit.card.overview')} theme={theme} dense accent={accent}>
                <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Box sx={{ width: 'fit-content', maxWidth: '100%', minWidth: 0 }}>
                    <Box
                      component="section"
                      role="list"
                      aria-label={t('visit.card.overview')}
                      sx={{
                        m: 0,
                        p: { xs: 1.25, sm: 1.5 },
                        ...visitInsetPanelSx(theme, accent),
                      }}
                    >
                      <VisitMetaRow label={t('visit.card.recordIndex')} value={visit.articleIndex == null ? null : `#${visit.articleIndex}`} />
                      <VisitMetaRow label={t('visit.card.municipality')} value={visit.municipality} />
                      <VisitMetaRow label={t('visit.card.region')} value={visit.region} />
                      <VisitMetaRow label={t('visit.card.visitDate')} value={visitDateLabel} />
                      <VisitMetaRow label={t('visit.card.squad')} value={visit.source} />
                      <VisitMetaRow label={t('visit.card.published')} value={publishedLabel} />
                    </Box>
                  </Box>
                </Box>
              </VisitSubsection>
            </Box>

            {hasStakeholders ? (
              <Box
                sx={{
                  minWidth: 0,
                  '@container visit (min-width: 400px)': { gridColumn: 2, gridRow: 1 },
                }}
              >
                <VisitSubsection title={t('visit.card.stakeholders')} theme={theme} dense accent={accent}>
                  <Box
                    sx={{
                      p: 1.25,
                      ...visitInsetPanelSx(theme, accent),
                    }}
                  >
                    <LocalizedTextBlock
                      text={visit.stakeholders}
                      original={visit.stakeholdersOriginal}
                      t={t}
                      variant="body2"
                      sx={{ lineHeight: 1.55, fontSize: '0.8125rem' }}
                    />
                  </Box>
                </VisitSubsection>
              </Box>
            ) : null}

            <Box
              sx={{
                minWidth: 0,
                minHeight: 0,
                '@container visit (min-width: 400px)': {
                  gridColumn: 2,
                  gridRow: hasStakeholders ? 2 : '1 / -1',
                  maxHeight: hasStakeholders ? 320 : 'none',
                  overflowY: hasStakeholders ? 'auto' : 'visible',
                },
              }}
            >
              <VisitSubsection title={t('visit.card.noteHighlights')} theme={theme} dense accent={accent}>
                {parsedHighlightItems.length > 0 ? (
                  <Box
                    component="section"
                    sx={{
                      p: 1.25,
                      ...visitInsetPanelSx(theme, accent),
                    }}
                  >
                    <Stack
                      component="div"
                      role="list"
                      spacing={0.75}
                      sx={{ m: 0, p: 0, listStyle: 'none' }}
                    >
                      {parsedHighlightItems.map((item) => (
                        <Box
                          key={item.key}
                          role="listitem"
                          sx={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: 1,
                            minWidth: 0,
                          }}
                        >
                          <Typography
                            component="span"
                            aria-hidden
                            variant="body2"
                            sx={{
                              lineHeight: 1.55,
                              flexShrink: 0,
                              color: 'text.secondary',
                              userSelect: 'none',
                            }}
                          >
                            {'\u2022'}
                          </Typography>
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{
                              lineHeight: 1.55,
                              fontSize: '0.8125rem',
                              minWidth: 0,
                              flex: '1 1 auto',
                              textAlign: presentationDir === 'rtl' ? 'right' : 'left',
                            }}
                          >
                            {item.kind === 'note' ? item.text : (item.text || '—')}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem' }}>
                    —
                  </Typography>
                )}
              </VisitSubsection>
            </Box>
          </Box>
        </CardContent>
      </Collapse>
      </Box>
    </Card>
  );
}

VisitMunicipalityCard.propTypes = {
  visit: PropTypes.object.isRequired,
  batchDate: PropTypes.string,
  t: translationFnPropType,
  formatDate: PropTypes.func.isRequired,
};

function compareVisitByRegionThenMunicipality(a, b) {
  const regionCmp = (a.region ?? '').localeCompare(b.region ?? '', 'he', { sensitivity: 'base' });
  if (regionCmp !== 0) return regionCmp;
  return (a.municipality ?? '').localeCompare(b.municipality ?? '', 'he', { sensitivity: 'base' });
}

export function VisitsTab({
  userScope = 'national',
  onUserScopeChange,
  districtAccess = null,
}) {
  const { getIdToken, getAppCheckToken, apiReady } = useAuth();
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [muniFilter, setMuniFilter] = useState(new Set());
  const [muniMenuAnchor, setMuniMenuAnchor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await authFetch(withLang(withUserDistrictQuery('/api/visits', userScope), lang), {
        getIdToken,
        getAppCheckToken,
      });
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
  }, [getIdToken, getAppCheckToken, userScope, lang]);

  useEffect(() => {
    if (!apiReady) return;
    void (async () => {
      await load();
    })();
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
  ];

  const districtScope = onUserScopeChange ? (
    <DistrictScopeSwitcher
      value={userScope}
      onChange={onUserScopeChange}
      districtAccess={districtAccess}
    />
  ) : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, pb: 2 }}>
      <PageHeader
        title={t('visit.title')}
        subtitle={t('visit.subtitle')}
        scope={districtScope}
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
        <Stack spacing={1.5}>
          {(selectedDay?.municipalities ?? []).length > 0 && (
              <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap" useFlexGap>
                <IconButton
                  size="small"
                  aria-label={t('visit.filter.municipalitiesMenu')}
                  aria-haspopup="true"
                  aria-expanded={Boolean(muniMenuAnchor)}
                  onClick={(e) => setMuniMenuAnchor((prev) => (prev ? null : e.currentTarget))}
                  sx={(theme) => ({
                    color: 'primary.main',
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.35)}`,
                    borderRadius: panelSectionRadius(theme),
                  })}
                >
                  <MenuIcon fontSize="small" />
                </IconButton>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>
                  {muniFilter.size === 0
                    ? t('visit.filter.allMunicipalitiesSelected')
                    : t('visit.filter.nMunicipalitiesSelected').replace('{n}', String(muniFilter.size))}
                </Typography>
                <Popover
                  open={Boolean(muniMenuAnchor)}
                  anchorEl={muniMenuAnchor}
                  onClose={() => setMuniMenuAnchor(null)}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                  slotProps={{
                    paper: {
                      sx: { mt: 0.75, maxHeight: 360, overflow: 'auto' },
                    },
                  }}
                >
                  <List dense role="listbox" aria-label={t('visit.filter.municipality')} sx={{ minWidth: 240, py: 0 }}>
                    {(selectedDay?.municipalities ?? []).map((municipality) => (
                      <ListItemButton
                        key={municipality}
                        selected={muniFilter.has(municipality)}
                        onClick={() => toggleMuni(municipality)}
                      >
                        <ListItemText primary={municipality} primaryTypographyProps={{ dir: 'auto', variant: 'body2' }} />
                      </ListItemButton>
                    ))}
                  </List>
                </Popover>
              </Stack>
          )}

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
            sx={(theme) => dateToggleGridSx(theme, { minColumnWidth: 132 })}
          >
            {data.days.map((day) => (
              <ToggleButton key={day.date} value={day.date}>
                {formatDate(day.date)} ({day.visitCount})
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
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

      <Box
        component="section"
        aria-label={t('visit.sec.visits')}
        sx={{
          display: 'grid',
          width: '100%',
          gap: 2,
          alignItems: 'stretch',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
        }}
      >
        {visibleVisits.map((visit) => (
          <Box key={visit.id} sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <VisitMunicipalityCard
              visit={visit}
              batchDate={selectedDay.date}
              t={t}
              formatDate={formatDate}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

VisitsTab.propTypes = {
  userScope: PropTypes.string,
  onUserScopeChange: PropTypes.func,
  districtAccess: PropTypes.object,
};
