import { createElement, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CellTowerOutlinedIcon from '@mui/icons-material/CellTowerOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import SupervisorAccountOutlinedIcon from '@mui/icons-material/SupervisorAccountOutlined';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import { expandSourceCitationLinks } from './ReportMarkdownView.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { scoreColor10, scoreLabel10, scoreVariant10 } from '../lib/score.js';
import { DriftSparkline, ResilienceSummaryCard, StatusTag, MarkdownArticle } from '../ui/index.js';

const COMPONENT_ICONS = {
  narrative:                 MenuBookOutlinedIcon,
  information_communication: CellTowerOutlinedIcon,
  lifesaving_behavior:       HealthAndSafetyOutlinedIcon,
  functional_continuity:     SettingsOutlinedIcon,
  community_capital:         HandshakeOutlinedIcon,
  leadership:                SupervisorAccountOutlinedIcon,
  belonging_solidarity:      Diversity3OutlinedIcon,
  wellbeing_at_risk:          MonitorHeartOutlinedIcon,
};

function getComponentIcon(componentId) {
  return COMPONENT_ICONS[componentId] ?? HelpOutlineOutlinedIcon;
}

const SOURCE_KINDS = ['field', 'radio', 'naftali', 'press', 'pbo'];

function SourceBadge({ kind, children }) {
  const safeKind = SOURCE_KINDS.includes(kind) ? kind : 'field';
  return (
    <Box
      component="span"
      sx={(theme) => {
        const palette = theme.palette.source[safeKind];
        return {
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: theme.typography.eyebrow.fontSize,
          fontWeight: theme.typography.eyebrow.fontWeight,
          letterSpacing: '0.02em',
          borderRadius: theme.custom.radius.xs,
          lineHeight: 1.3,
          paddingTop: theme.spacing(0.25),
          paddingBottom: theme.spacing(0.25),
          paddingLeft: theme.spacing(0.5),
          paddingRight: theme.spacing(0.5),
          marginInlineEnd: theme.spacing(0.5),
          verticalAlign: 'middle',
          whiteSpace: 'nowrap',
          border: `1px solid ${palette.border}`,
          background: palette.bg,
          color: palette.fg,
        };
      }}
    >
      {children}
    </Box>
  );
}

function scoreLabel(s, t) {
  return scoreLabel10(s, {
    critical: t('score.critical'),
    weak: t('score.weak'),
    moderate: t('score.moderate'),
    good: t('score.good'),
    strong: t('score.strong'),
  });
}

function fmt01(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${Math.round(x * 100)}%`;
}

function ReportSection({ title, children, ...props }) {
  return (
    <Box
      component="section"
      sx={(theme) => ({
        background: theme.palette.background.paper,
        border: theme.custom.border.hairline,
        borderRadius: theme.custom.radius.lg,
        paddingTop: theme.spacing(2.5),
        paddingBottom: theme.spacing(2.5),
        paddingLeft: theme.spacing(3),
        paddingRight: theme.spacing(3),
      })}
      {...props}
    >
      <Typography
        variant="panelTitle"
        component="h2"
        color="text.secondary"
        sx={(theme) => ({ marginBottom: theme.spacing(1.5) })}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function DeltaAdornment({ delta, significant, t }) {
  if (delta == null || delta === 0) return null;
  const tpl = delta > 0 ? t('report.delta.up') : t('report.delta.down');
  const text = tpl.replace('{delta}', String(delta));
  return (
    <Box
      component="span"
      title={significant ? t('report.delta.significant') : undefined}
      sx={(theme) => ({
        marginInlineStart: theme.spacing(0.5),
        paddingInline: theme.spacing(0.6),
        paddingBlock: '1px',
        borderRadius: theme.custom.radius.xs,
        fontSize: theme.typography.eyebrow.fontSize,
        fontWeight: 600,
        lineHeight: 1.2,
        color: delta > 0 ? theme.palette.success.main : theme.palette.error.main,
        border: significant
          ? `1.5px solid ${delta > 0 ? theme.palette.success.main : theme.palette.error.main}`
          : `1px solid ${theme.palette.divider}`,
        background: theme.palette.background.paper,
      })}
    >
      {text}
    </Box>
  );
}

function ComponentChip({ label, variant, value, t, comp }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.6}
      sx={(theme) => ({
        background: theme.palette.background.paper,
        border: theme.custom.border.hairline,
        borderRadius: theme.custom.radius.pill,
        paddingTop: theme.spacing(0.4),
        paddingBottom: theme.spacing(0.4),
        paddingLeft: theme.spacing(1),
        paddingRight: theme.spacing(1),
        fontSize: theme.typography.cardTitle.fontSize,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      })}
    >
      <Box component="span" sx={{ textTransform: 'capitalize', color: 'text.secondary' }}>
        {label}
      </Box>
      <StatusTag variant={variant}>{scoreLabel(value, t)}</StatusTag>
      {comp && (
        <DeltaAdornment
          delta={comp.delta_score}
          significant={comp.delta_flag === 'significant'}
          t={t}
        />
      )}
    </Stack>
  );
}

function InstrumentStateBadges({ instrument, t }) {
  const inst = instrument ?? {};
  const suffKey = `report.instrument.sufficiency.${inst.evidence_sufficiency ?? 'adequate'}`;
  return (
    <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ justifyContent: 'flex-end' }}>
      <StatusTag variant="neutral">
        {t(`confidence.${inst.confidence}`) ?? inst.confidence}
      </StatusTag>
      <StatusTag variant="neutral">{t(suffKey)}</StatusTag>
      {inst.contested && <ContestedBadge t={t} />}
      {inst.significant_delta && (
        <StatusTag variant="alert">{t('report.delta.significant')}</StatusTag>
      )}
      {inst.floor_clamped && (
        <StatusTag variant="alert">{t('report.scoreInterval.thinEvidence')}</StatusTag>
      )}
      {inst.ci_unstable && (
        <StatusTag variant="alert">{t('report.scoreInterval.ciUnstable')}</StatusTag>
      )}
    </Stack>
  );
}

function ContestedBadge({ t }) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        marginInlineStart: theme.spacing(1),
        fontSize: theme.typography.eyebrow.fontSize,
        fontWeight: 600,
        color: theme.palette.warning.main,
        border: `1px solid ${theme.palette.warning.main}`,
        borderRadius: theme.custom.radius.xs,
        paddingInline: theme.spacing(0.6),
        paddingBlock: '1px',
        textTransform: 'lowercase',
      })}
    >
      {t('report.polarization.contested')}
    </Box>
  );
}

function ScoreWithInterval({ comp, t }) {
  if (comp.score == null) {
    return (
      <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
        {t('report.insufficientData')}
      </Typography>
    );
  }
  const hasCi = comp.score_low != null && comp.score_high != null
    && (comp.score_low !== comp.score || comp.score_high !== comp.score);
  const showSmoothed = comp.score_smoothed != null && comp.score_smoothed !== comp.score;
  const floorClamped = comp.floor_clamped === true;
  const ciUnstable = comp.ci_unstable === true;

  const annotations = (
    <>
      {showSmoothed && (
        <Typography component="span" variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
          {t('report.scoreInterval.smoothed').replace('{n}', String(comp.score_smoothed))}
        </Typography>
      )}
      {floorClamped && (
        <Typography component="span" variant="caption" color="warning.main" sx={{ fontStyle: 'italic' }}>
          {t('report.scoreInterval.thinEvidence')}
        </Typography>
      )}
      {ciUnstable && (
        <Typography component="span" variant="caption" color="warning.main" sx={{ fontStyle: 'italic' }}>
          {t('report.scoreInterval.ciUnstable')}
        </Typography>
      )}
    </>
  );

  if (!hasCi) {
    return (
      <Stack component="span" spacing={0.25}>
        <Typography component="span" variant="caption" color="text.secondary">
          {comp.score}/10
        </Typography>
        {annotations}
      </Stack>
    );
  }
  return (
    <Stack component="span" spacing={0.25}>
      <Typography component="span" variant="caption" color="text.secondary">
        {t('report.scoreInterval')
          .replace('{score}', String(comp.score))
          .replace('{low}', String(comp.score_low))
          .replace('{high}', String(comp.score_high))}
      </Typography>
      {annotations}
    </Stack>
  );
}

function WhyThisScore({ comp, t }) {
  const contributors = comp.top_contributors;
  if (!Array.isArray(contributors) || contributors.length === 0) return null;
  const top = contributors.slice(0, 3);

  return (
    <Box sx={(theme) => ({
      marginTop: theme.spacing(0.75),
      marginBottom: theme.spacing(0.75),
      paddingTop: theme.spacing(0.75),
      paddingBottom: theme.spacing(0.75),
      paddingLeft: theme.spacing(1),
      paddingRight: theme.spacing(1),
      borderRadius: theme.custom.radius.sm,
      background: theme.palette.action.hover,
    })}>
      <Typography
        variant="eyebrow"
        component="div"
        sx={(theme) => ({ marginBottom: theme.spacing(0.25), color: 'text.secondary' })}
      >
        {t('report.whyThisScore.label')}
      </Typography>
      <Stack spacing={0.25}>
        {top.map((s, i) => {
          const sign = s._polarity === '-' ? '−' : '+';
          const signColor = s._polarity === '-' ? 'error.main' : 'success.main';
          const signalLabel = (s.signal_type ?? '').replace(/_/g, ' ');
          return (
            <Stack
              key={i}
              direction="row"
              alignItems="baseline"
              spacing={0.75}
              sx={{ minWidth: 0 }}
            >
              <Typography variant="caption" sx={{ color: signColor, fontWeight: 700, width: '1em' }}>
                {sign}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: 'text.secondary',
                  textTransform: 'lowercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {signalLabel}
              </Typography>
              {s.source_type && (
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  · {s.source_type}{s.article_source ? ` · ${s.article_source.replace(/^pbo-/, '')}` : ''}
                </Typography>
              )}
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', marginInlineStart: 'auto', whiteSpace: 'nowrap' }}
              >
                {t('report.whyThisScore.contribution')
                  .replace('{value}', s._contribution.toFixed(2))}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}

function CounterfactualHint({ comp, t }) {
  if (comp.counterfactual_delta == null) return null;
  if (Math.abs(comp.counterfactual_delta) < 1) return null;
  const sign = comp.counterfactual_delta > 0 ? '+' : '';
  const text = t('report.counterfactual')
    .replace('{delta}', `${sign}${comp.counterfactual_delta}`);
  return (
    <Typography
      variant="caption"
      sx={(theme) => ({
        display: 'block',
        marginTop: theme.spacing(0.5),
        marginBottom: theme.spacing(0.75),
        color: 'text.secondary',
        fontStyle: 'italic',
      })}
    >
      {text}
    </Typography>
  );
}

function FacetBars({ facets, t }) {
  if (!facets) return null;
  const entries = Object.entries(facets);
  if (entries.length === 0) return null;
  return (
    <Box sx={(theme) => ({ marginTop: theme.spacing(1.5) })}>
      <Typography
        variant="eyebrow"
        component="div"
        sx={(theme) => ({ marginBottom: theme.spacing(0.5), color: 'text.secondary' })}
      >
        {t('report.facets.label')}
      </Typography>
      <Stack spacing={0.5}>
        {entries.map(([name, f]) => {
          const labelKey = `report.facet.${name}`;
          const facetLabel = t(labelKey) === labelKey ? name : t(labelKey);
          const pct = f.score != null ? (f.score / 10) * 100 : 0;
          return (
            <Box key={name}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>
                  {facetLabel}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {f.score != null ? `${f.score}/10` : '—'}
                  {' · '}
                  {f.signal_count ?? 0}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={pct}
                color={f.score == null ? 'inherit' : (f.score <= 4 ? 'error' : f.score <= 6 ? 'warning' : 'success')}
                sx={{ height: 6, borderRadius: 3, opacity: f.score == null ? 0.3 : 1 }}
              />
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

function DeltaLine({ comp, t }) {
  if (comp.delta_score == null) return null;
  const sign = comp.delta_score > 0 ? '+' : '';
  const sigText = comp.delta_significance != null
    ? ` (z=${comp.delta_significance.toFixed(2)})`
    : '';
  return (
    <Typography
      variant="caption"
      sx={(theme) => ({
        display: 'block',
        marginTop: theme.spacing(0.25),
        color: comp.delta_flag === 'significant'
          ? (comp.delta_score > 0 ? theme.palette.success.main : theme.palette.error.main)
          : 'text.secondary',
        fontWeight: comp.delta_flag === 'significant' ? 600 : 400,
      })}
    >
      {t('report.delta.label')}: {sign}{comp.delta_score}{sigText}
      {comp.delta_flag === 'significant' && ` — ${t('report.delta.significant')}`}
    </Typography>
  );
}

function ComponentCard({
  comp,
  t,
  sourceSignals,
  driftSeries,
  driftLoading,
  displayTier = 'operator',
  open,
  evidenceOpen,
  onToggle,
  onEvidenceToggle,
}) {
  const isAnalyst = displayTier === 'analyst';
  const label = t(`comp.${comp.component_id}`) ?? comp.component_id.replace(/_/g, ' ');
  const confidenceLabel = t(`confidence.${comp.confidence}`) ?? comp.confidence;

  const isFiltered = sourceSignals !== null && sourceSignals !== undefined;
  const signals = isFiltered ? (sourceSignals ?? []) : null;
  const curatedEvidence = isFiltered ? null : (comp.evidence ?? []);
  const evidenceCount = isFiltered ? signals.length : curatedEvidence.length;
  const isInsufficient = comp.confidence === 'insufficient_data'
    || (!isAnalyst && (comp.instrument?.evidence_sufficiency === 'thin' || !comp.instrument))
    || (isAnalyst && comp.score == null);
  const isContested = comp.polarization != null && comp.polarization > 0.5
    && (comp.evidence_mass ?? 0) > 4;

  return (
    <Accordion
      expanded={open}
      onChange={(_, expanded) => onToggle(expanded)}
      sx={(theme) => ({
        marginBottom: theme.spacing(1),
        ...(isInsufficient ? {
          borderStyle: 'dashed',
          opacity: 0.85,
          backgroundColor: theme.palette.action.hover,
        } : null),
      })}
    >
      <AccordionSummary>
        {createElement(getComponentIcon(comp.component_id), {
          sx: (theme) => ({
            fontSize: theme.typography.sectionTitle.fontSize,
            color: theme.palette.text.secondary,
            marginRight: theme.spacing(1),
          }),
        })}
        <Stack direction="column" sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography sx={{ fontWeight: 500, textTransform: 'capitalize' }}>
              {label}
            </Typography>
            {isContested && <ContestedBadge t={t} />}
          </Stack>
        </Stack>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ flexShrink: 0, marginLeft: 'auto', textAlign: 'right', maxWidth: '55%' }}
        >
          {isAnalyst ? (
            <>
              <ScoreWithInterval comp={comp} t={t} />
              <DeltaAdornment
                delta={comp.delta_score}
                significant={comp.delta_flag === 'significant'}
                t={t}
              />
              <Tooltip title="Confidence level">
                <Typography variant="caption" color="text.secondary">
                  Confidence: {confidenceLabel}
                </Typography>
              </Tooltip>
            </>
          ) : (
            <InstrumentStateBadges instrument={comp.instrument} t={t} />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {isAnalyst && (
          <Box sx={(theme) => ({ marginTop: theme.spacing(0.5), marginBottom: theme.spacing(0.75) })}>
            {driftLoading && (
              <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', display: 'block', marginBottom: 0.5 }}>
                {t('app.reportLoading')}
              </Typography>
            )}
            <DriftSparkline series={driftSeries ?? []} t={t} height={78} />
          </Box>
        )}
        {isAnalyst && <WhyThisScore comp={comp} t={t} />}
        {isAnalyst && <DeltaLine comp={comp} t={t} />}
        {isAnalyst && <CounterfactualHint comp={comp} t={t} />}
        <MarkdownArticle variant="report" markdown={expandSourceCitationLinks(comp.narrative ?? '')} />
        {isAnalyst && <FacetBars facets={comp.facets} t={t} />}

        {evidenceCount > 0 && (
          <Accordion
            expanded={evidenceOpen}
            onChange={(_, expanded) => onEvidenceToggle(expanded)}
            sx={(theme) => ({ borderRadius: `${theme.custom.radius.sm}px !important` })}
          >
            <AccordionSummary sx={(theme) => ({
              color: theme.palette.text.secondary,
              fontSize: theme.typography.meta.fontSize,
              fontWeight: 500,
            })}>
              <Typography variant="meta" component="span">{t('report.evidence')}</Typography>
              <Typography variant="caption" component="span" sx={{ marginLeft: 'auto', opacity: 0.7 }}>
                {evidenceCount} {t('report.items')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={(theme) => ({
              gap: theme.spacing(1),
              fontSize: theme.typography.body2.fontSize,
            })}>
              <Box component="ul" sx={(theme) => ({ paddingLeft: theme.spacing(2.5), margin: 0 })}>
                {isFiltered
                  ? signals.map((s, i) => (
                    <Box
                      component="li"
                      key={i}
                      sx={(theme) => ({
                        display: 'block',
                        marginBottom: theme.spacing(1),
                        lineHeight: theme.typography.body2.lineHeight,
                      })}
                    >
                      <Box
                        component="span"
                        sx={(theme) => ({
                          fontWeight: 600,
                          color: theme.palette.text.secondary,
                          display: 'inline-block',
                          marginBottom: theme.spacing(0.25),
                        })}
                      >
                        {s.source_type === 'field' && <SourceBadge kind="field">{t('report.badge.field')}</SourceBadge>}
                        {s.source_type === 'radio' && <SourceBadge kind="radio">{t('report.badge.radio')}</SourceBadge>}
                        {s.source_type === 'naftali' && <SourceBadge kind="naftali">{t('report.badge.naftali')}</SourceBadge>}
                        {(s.source_type === 'news' || s.source_type === 'press') && <SourceBadge kind="press">{t('report.badge.press')}</SourceBadge>}
                        {s.source_type === 'pbo' && <SourceBadge kind="pbo">{t('report.badge.pbo')}</SourceBadge>}
                        {s.source_type === 'pbo' ? s.article_source?.replace(/^pbo-/, '') : s.article_source}
                      </Box>
                      <Box component="span" sx={{ display: 'block' }}>{s.evidence}</Box>
                    </Box>
                  ))
                  : curatedEvidence.map((e, i) => (
                    <Box component="li" key={i} sx={(theme) => ({ marginBottom: theme.spacing(0.75) })}>
                      <MarkdownArticle variant="report" markdown={expandSourceCitationLinks(e)} />
                    </Box>
                  ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}

        {isFiltered && signals.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            {t('report.noSourceEvidence') ?? 'No signals from this source for this component.'}
          </Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export function ReportView({
  assessment,
  scoreBySource,
  displayTier = 'operator',
  readOnly: _readOnly,
  translating,
  translateError,
  reportDate: _reportDate,
  reportScope: _reportScope,
  driftByComponent,
  driftLoading,
  openCompId: openCompIdProp,
  setOpenCompId: setOpenCompIdProp,
  openEvidenceCompId: openEvidenceCompIdProp,
  setOpenEvidenceCompId: setOpenEvidenceCompIdProp,
}) {
  const isAnalyst = displayTier === 'analyst';
  const { t } = useLanguage();
  const theme = useTheme();
  const overall = assessment.overall_resilience_score;
  const [openCompIdInternal, setOpenCompIdInternal] = useState(null);
  const [openEvidenceCompIdInternal, setOpenEvidenceCompIdInternal] = useState(null);
  const compRefs = useRef({});

  const openCompId = openCompIdProp ?? openCompIdInternal;
  const setOpenCompId = setOpenCompIdProp ?? setOpenCompIdInternal;
  const openEvidenceCompId = openEvidenceCompIdProp ?? openEvidenceCompIdInternal;
  const setOpenEvidenceCompId = setOpenEvidenceCompIdProp ?? setOpenEvidenceCompIdInternal;

  const components = assessment.components ?? [];
  const norrisCaps = assessment.norris_capacities ?? [];
  const driftMap = driftByComponent ?? {};

  function getSourceSignals(compId) {
    if (!scoreBySource) return null;
    const all = [];
    for (const srcData of Object.values(scoreBySource)) {
      const compData = srcData[compId];
      if (compData?.signals) all.push(...compData.signals);
    }
    return all.length > 0 ? all : null;
  }

  const accordionTransitionMs = theme.transitions.duration.standard;

  useEffect(() => {
    if (!openCompId) return;
    const el = compRefs.current?.[openCompId];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const correctionTimer = setTimeout(() => {
      const settled = compRefs.current?.[openCompId];
      if (settled) settled.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, accordionTransitionMs + 60);
    return () => clearTimeout(correctionTimer);
  }, [openCompId, accordionTransitionMs]);

  return (
    <Stack
      spacing={4}
      aria-busy={translating ? 'true' : 'false'}
    >
      {translateError && (
        <Alert severity="error" variant="outlined">
          Translation error: {translateError}
        </Alert>
      )}

      {isAnalyst && (
        <>
          <ResilienceSummaryCard
            statusText={scoreLabel(overall, t)}
            statusColor={scoreColor10(overall, theme)}
            title={t('report.overallLabel')}
          />
          <Box
            sx={(theme) => ({
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing(0.5),
              minWidth: 0,
            })}
          >
            {components.map((c) => (
              <ComponentChip
                key={c.component_id}
                label={t(`comp.${c.component_id}`) ?? c.component_id.replace(/_/g, ' ')}
                value={c.score}
                variant={scoreVariant10(c.score)}
                t={t}
                comp={c}
              />
            ))}
          </Box>
        </>
      )}

      {isAnalyst && Array.isArray(norrisCaps) && norrisCaps.length > 0 && (
        <ReportSection title={t('report.norris.title') ?? 'Norris capacities'}>
          <Stack spacing={1.5}>
            {norrisCaps.map((cap) => (
              <Box
                key={cap.capacity_id}
                sx={(theme) => ({
                  border: theme.custom.border.hairline,
                  borderRadius: theme.custom.radius.md,
                  padding: theme.spacing(1.5),
                  background: theme.palette.background.default,
                })}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="cardTitle" sx={{ marginBottom: 0.25 }}>
                      {t(`norris.capacity.${cap.capacity_id}`) ?? cap.label_en ?? cap.capacity_id}
                    </Typography>
                    {cap.label_he && (
                      <Typography variant="body2" color="text.secondary">
                        {cap.label_he}
                      </Typography>
                    )}
                  </Box>

                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <StatusTag variant={scoreVariant10(cap.score)}>
                      {cap.score != null ? `${cap.score.toFixed(1)}/10` : '—'}
                    </StatusTag>
                    <Typography variant="body2" color="text.secondary">
                      {t('norris.evidenceLevel') ?? 'Evidence level'}: {cap.certainty != null ? `${Math.round(cap.certainty * 100)}%` : '—'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('norris.evidenceMass') ?? 'Evidence mass'}: {cap.evidence_mass != null ? (Math.round(cap.evidence_mass * 10) / 10) : '—'}
                    </Typography>
                  </Stack>
                </Stack>

                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ marginTop: 1 }}>
                  <StatusTag variant="neutral">
                    {t('norris.diag.robustness') ?? 'robustness'} {fmt01(cap.diagnostics?.robustness)}
                  </StatusTag>
                  <StatusTag variant="neutral">
                    {t('norris.diag.redundancy') ?? 'redundancy'} {fmt01(cap.diagnostics?.redundancy)}
                  </StatusTag>
                  <StatusTag variant="neutral">
                    {t('norris.diag.rapidity') ?? 'rapidity'} {cap.diagnostics?.rapidity == null ? '—' : fmt01(cap.diagnostics?.rapidity)}
                  </StatusTag>
                </Stack>

                {cap.top_contributors?.length > 0 && (
                  <Box sx={{ marginTop: 1 }}>
                    <Typography variant="eyebrow" color="text.secondary" sx={{ marginBottom: 0.5 }}>
                      {t('norris.topContributors') ?? 'Top contributors'}
                    </Typography>
                    <Stack spacing={0.5}>
                      {cap.top_contributors.slice(0, 3).map((tc, idx) => (
                        <Typography key={`${cap.capacity_id}-${idx}`} variant="body2">
                          <Box component="span" sx={{ fontFamily: 'monospace' }}>
                            {tc.signal_type}
                          </Box>
                          {tc.evidence ? ` — ${tc.evidence}` : ''}
                        </Typography>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Box>
            ))}
          </Stack>
        </ReportSection>
      )}

      <ReportSection title={t('report.executiveSummary')}>
        <Box
          sx={{
            maxWidth: 960,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <MarkdownArticle
            variant="report"
            markdown={expandSourceCitationLinks(assessment.cross_component_synthesis ?? '')}
          />
        </Box>
      </ReportSection>

      <ReportSection title={t('report.components')}>
        {(assessment.components ?? []).map((c) => (
          <Box
            key={c.component_id}
            ref={(el) => {
              if (el) compRefs.current[c.component_id] = el;
            }}
          >
            <ComponentCard
              comp={c}
              t={t}
              displayTier={displayTier}
              sourceSignals={getSourceSignals(c.component_id)}
              driftSeries={driftMap?.[c.component_id]?.series ?? []}
              driftLoading={driftLoading}
              open={openCompId === c.component_id}
              evidenceOpen={openEvidenceCompId === c.component_id}
              onToggle={(isOpen) => {
                setOpenCompId(isOpen ? c.component_id : null);
                if (!isOpen) {
                  setOpenEvidenceCompId((prev) => (prev === c.component_id ? null : prev));
                }
              }}
              onEvidenceToggle={(isOpen) => {
                setOpenEvidenceCompId(isOpen ? c.component_id : null);
              }}
            />
          </Box>
        ))}
      </ReportSection>

      {assessment.media_bias_caveats && (
        <ReportSection title={t('report.caveats')}>
          <Box sx={{ color: 'text.secondary' }}>
            <MarkdownArticle
              variant="report"
              markdown={expandSourceCitationLinks(assessment.media_bias_caveats)}
            />
          </Box>
        </ReportSection>
      )}

    </Stack>
  );
}
