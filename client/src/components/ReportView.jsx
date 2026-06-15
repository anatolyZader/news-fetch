import { createElement, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
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
import { DriftSparkline, StatusTag, MarkdownArticle } from '../ui/index.js';
import { AttentionPanel } from './AttentionPanel.jsx';
import { ActionCompassPanel } from './ActionCompassPanel.jsx';
import { EpistemicStatusBanner } from './EpistemicStatusBanner.jsx';
import { EvidenceOverviewPanel } from './EvidenceOverviewPanel.jsx';
import { ValidationReviewPanel } from './ValidationReviewPanel.jsx';
import { CatalogProposalPanel } from './CatalogProposalPanel.jsx';
import { OovAnomalyClustersPanel } from './OovAnomalyClustersPanel.jsx';
import { OperatorRecommendationsPanel } from './OperatorRecommendationsPanel.jsx';
import { DecisionBriefPanel } from './DecisionBriefPanel.jsx';
import { EvidenceTreePanel } from './EvidenceTreePanel.jsx';
import { AgentDivergencePanel } from './AgentDivergencePanel.jsx';
import { InstrumentMetricsBadges } from './InstrumentMetricsBadges.jsx';
import { ReportComponentFilterBar, readReportComponentFilter } from './ReportComponentFilterBar.jsx';
import { filterReportComponents } from '../lib/reportComponentFilter.js';
import PropTypes from 'prop-types';
import {
  assessmentShape,
  componentScoreShape,
  driftByComponentShape,
  facetsShape,
  macroSignalShape,
  scoreBySourceShape,
  sourceKindPropType,
  translationFnPropType,
} from '../lib/reportPropTypes.js';

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

const SOURCE_KINDS = new Set(['field', 'radio', 'naftali', 'press', 'pbo', 'social']);

function SourceBadge({ kind, children }) {
  const safeKind = SOURCE_KINDS.has(kind) ? kind : 'field';
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
          borderRadius: `${theme.custom.radius.section}px`,
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

function GeoEpistemicBadge({ signal, t }) {
  const prov = signal?.geo?.resolution?.provenance;
  const metricsOff =
    signal?.metricsEligible === false
    || signal?.geo?.policy?.usableForMetrics === false
    || signal?.geo?.usableForMetrics === false;
  if (prov !== 'text_inferred' && !metricsOff) return null;
  const label = prov === 'text_inferred' ? t('report.geo.textInferred') : t('report.geo.notInScores');
  return (
    <Box
      component="span"
      title={t('report.geo.notInScoresHint')}
      sx={(theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: theme.typography.eyebrow.fontSize,
        fontWeight: 500,
        borderRadius: `${theme.custom.radius.section}px`,
        lineHeight: 1.3,
        paddingTop: theme.spacing(0.25),
        paddingBottom: theme.spacing(0.25),
        paddingLeft: theme.spacing(0.5),
        paddingRight: theme.spacing(0.5),
        marginInlineStart: theme.spacing(0.5),
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        border: `1px solid ${theme.palette.warning.main}`,
        background: theme.palette.warning.light,
        color: theme.palette.warning.contrastText,
      })}
    >
      {label}
    </Box>
  );
}

GeoEpistemicBadge.propTypes = {
  signal: PropTypes.object,
  t: PropTypes.func.isRequired,
};

function fmt01(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${Math.round(x * 100)}%`;
}

function flatAccordionSx(theme) {
  return {
    marginBottom: 0,
    borderRadius: '0 !important',
    border: 'none',
    boxShadow: 'none',
    backgroundColor: 'transparent',
    '&:before': { display: 'none' },
    '&.Mui-expanded': { margin: 0 },
    '& .MuiAccordionSummary-root': {
      backgroundColor: 'transparent',
      minHeight: 56,
      [theme.breakpoints.down('sm')]: {
        paddingLeft: theme.spacing(1.5),
        paddingRight: theme.spacing(1.5),
        paddingTop: theme.spacing(1.25),
        paddingBottom: theme.spacing(1.25),
        minHeight: 60,
      },
    },
    '&.Mui-expanded .MuiAccordionSummary-root': {
      backgroundColor: theme.palette.action.hover,
      minHeight: 56,
      [theme.breakpoints.down('sm')]: {
        minHeight: 60,
      },
    },
    [theme.breakpoints.down('md')]: {
      contentVisibility: 'auto',
      containIntrinsicSize: '0 420px',
    },
  };
}

function ReportSection({ title, children, flat = false, ...props }) {
  return (
    <Box
      component="section"
      sx={(theme) => (flat
        ? {
          paddingTop: theme.spacing(2.5),
          paddingBottom: theme.spacing(2.5),
          borderBottom: theme.custom.border.hairline,
        }
        : {
          background: theme.palette.background.paper,
          border: theme.custom.border.hairline,
          borderRadius: `${theme.custom.radius.section}px`,
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

function deltaToneColor(delta, theme) {
  return delta > 0 ? theme.palette.success.main : theme.palette.error.main;
}

function deltaAdornmentBorder(delta, significant, theme) {
  if (!significant) return `1px solid ${theme.palette.divider}`;
  return `1.5px solid ${deltaToneColor(delta, theme)}`;
}

function facetBarColor(score) {
  if (score == null) return 'inherit';
  if (score <= 4) return 'error';
  if (score <= 6) return 'warning';
  return 'success';
}

function deltaLineColor(comp, theme) {
  if (comp.delta_flag !== 'significant') return 'text.secondary';
  return deltaToneColor(comp.delta_score, theme);
}

function formatNorrisRapidity(value) {
  if (value == null) return '—';
  return fmt01(value);
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
        borderRadius: `${theme.custom.radius.section}px`,
        fontSize: theme.typography.eyebrow.fontSize,
        fontWeight: 600,
        lineHeight: 1.2,
        color: deltaToneColor(delta, theme),
        border: deltaAdornmentBorder(delta, significant, theme),
        background: theme.palette.background.paper,
      })}
    >
      {text}
    </Box>
  );
}

function InstrumentStateBadges({ instrument, t }) {
  const inst = instrument ?? {};
  const suffKey = `report.instrument.sufficiency.${inst.evidence_sufficiency ?? 'adequate'}`;

  const tags = [
    <StatusTag key="confidence" variant="neutral">
      {t(`confidence.${inst.confidence}`) ?? inst.confidence}
    </StatusTag>,
    <StatusTag key="sufficiency" variant="neutral">{t(suffKey)}</StatusTag>,
    inst.contested && <ContestedBadge key="contested" t={t} />,
    inst.contested_evidence && !inst.contested && (
      <StatusTag key="contested-evidence" variant="alert">{t('report.instrument.contestedEvidence')}</StatusTag>
    ),
    inst.significant_delta && (
      <StatusTag key="sig-delta" variant="alert">{t('report.delta.significant')}</StatusTag>
    ),
    inst.ci_unstable && (
      <StatusTag key="ci-unstable" variant="alert">{t('report.scoreInterval.ciUnstable')}</StatusTag>
    ),
    inst.contested_thin && (
      <StatusTag key="contested-thin" variant="alert">{t('report.instrument.contestedThin')}</StatusTag>
    ),
    inst.thin_evidence_instrument === 'unverified_alert' && (
      <StatusTag key="unverified" variant="alert">{t('report.instrument.unverifiedAlert')}</StatusTag>
    ),
    inst.thin_evidence_instrument === 'critical_presence_failure' && (
      <StatusTag key="presence-failure" variant="critical">{t('report.instrument.criticalPresenceFailure')}</StatusTag>
    ),
    inst.thin_evidence_instrument === 'critical_single_signal' && (
      <StatusTag key="single-signal" variant="alert">{t('report.instrument.criticalSingleSignal')}</StatusTag>
    ),
    inst.salience_critical && inst.floor_bypassed && (
      <StatusTag key="floor-bypass" variant="alert">{t('report.instrument.salienceFloorBypass')}</StatusTag>
    ),
    inst.thin_evidence_instrument === 'limited_evidence_neutral' && (
      <StatusTag key="limited-neutral" variant="neutral">{t('report.instrument.limitedNeutral')}</StatusTag>
    ),
    inst.interpretive_summary && (
      <StatusTag key="interpretive" variant="warning">{t('report.instrument.interpretiveSummary')}</StatusTag>
    ),
    inst.source_cap_binding && (
      <StatusTag key="source-cap" variant="warning">{t('report.instrument.sourceCapBinding')}</StatusTag>
    ),
  ].filter(Boolean);

  return (
    <Stack
      direction="row"
      flexWrap="wrap"
      sx={(theme) => ({
        gap: theme.spacing(0.75),
        width: '100%',
        justifyContent: { xs: 'center', sm: 'flex-end' },
        maxWidth: '100%',
        [theme.breakpoints.down('sm')]: {
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          justifyItems: 'stretch',
          alignItems: 'stretch',
        },
      })}
    >
      {tags.map((tag) => (
        <Box
          key={tag.key}
          sx={(theme) => ({
            display: 'flex',
            justifyContent: 'center',
            minWidth: 0,
            [theme.breakpoints.down('sm')]: {
              width: '100%',
              '& .MuiChip-root': {
                width: '100%',
                justifyContent: 'center',
              },
            },
          })}
        >
          {tag}
        </Box>
      ))}
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
        borderRadius: `${theme.custom.radius.section}px`,
        paddingInline: theme.spacing(0.6),
        paddingBlock: '1px',
        textTransform: 'lowercase',
      })}
    >
      {t('report.polarization.contested')}
    </Box>
  );
}

function contributorPolaritySign(polarity) {
  if (polarity === '-') return '−';
  if (polarity === '+') return '+';
  return '·';
}

function contributorPolarityColor(polarity) {
  if (polarity === '-') return 'error.main';
  if (polarity === '+') return 'success.main';
  return 'text.secondary';
}

function WhyThisScore({ comp, t }) {
  const contributors = comp.top_contributors ?? comp.instrument?.top_contributors;
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
      borderRadius: `${theme.custom.radius.section}px`,
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
          const polarity = s._polarity;
          const sign = contributorPolaritySign(polarity);
          const signColor = contributorPolarityColor(polarity);
          const signalLabel = (s.signal_type ?? '').replaceAll('_', ' ');
          const contribution = s._contribution ?? s._contribution_raw;
          const preCap = s._contribution_pre_cap;
          const showPreCap = preCap != null && contribution != null && Math.abs(preCap - contribution) > 0.01;
          return (
            <Stack
              key={`${s.signal_type ?? 'signal'}-${i}`}
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
              {contribution != null && (
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', marginInlineStart: 'auto', whiteSpace: 'nowrap' }}
                >
                  {showPreCap
                    ? t('report.whyThisScore.contributionCapped')
                      .replace('{pre}', Number(preCap).toFixed(2))
                      .replace('{post}', Number(contribution).toFixed(2))
                    : t('report.whyThisScore.contribution')
                      .replace('{value}', Number(contribution).toFixed(2))}
                  {s._cap_layer && s._cap_scale_factor != null && s._cap_scale_factor < 0.999 && (
                    <> · {s._cap_layer} ×{s._cap_scale_factor.toFixed(2)}</>
                  )}
                </Typography>
              )}
              {contribution == null && s.evidence && (
                <Typography variant="caption" sx={{ color: 'text.disabled', marginInlineStart: 'auto' }}>
                  {String(s.evidence).slice(0, 80)}
                </Typography>
              )}
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
          const pct = f.score == null ? 0 : (f.score / 10) * 100;
          const showScore = f.score != null;
          return (
            <Box key={name}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>
                  {facetLabel}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {showScore ? `${f.score}/10 · ` : ''}
                  {f.signal_count ?? 0}
                </Typography>
              </Stack>
              {showScore && (
                <LinearProgress
                  variant="determinate"
                  value={pct}
                  color={facetBarColor(f.score)}
                  sx={{ height: 6, borderRadius: 3, opacity: f.score == null ? 0.3 : 1 }}
                />
              )}
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
  const sigText = comp.delta_significance == null
    ? ''
    : ` (z=${comp.delta_significance.toFixed(2)})`;
  return (
    <Typography
      variant="caption"
      sx={(theme) => ({
        display: 'block',
        marginTop: theme.spacing(0.25),
        color: deltaLineColor(comp, theme),
        fontWeight: comp.delta_flag === 'significant' ? 600 : 400,
      })}
    >
      {t('report.delta.label')}: {sign}{comp.delta_score}{sigText}
      {comp.delta_flag === 'significant' && ` — ${t('report.delta.significant')}`}
    </Typography>
  );
}

function MacroSignalsSection({ macroSignals, t, isAnalyst }) {
  const list = Array.isArray(macroSignals) ? macroSignals : [];
  if (list.length === 0) return null;
  if (!isAnalyst) return null;

  return (
    <Box sx={(theme) => ({
      padding: theme.spacing(1.5),
      border: theme.custom.border.hairline,
      borderRadius: `${theme.custom.radius.section}px`,
      background: theme.palette.action.hover,
    })}>
      <Typography variant="cardTitle" sx={{ marginBottom: 1 }}>
        {t('report.macroSignals.title').replace('{n}', String(list.length))}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginBottom: 1 }}>
        {t('report.macroSignals.body')}
      </Typography>
      <Stack spacing={0.75}>
        {list.slice(0, 12).map((s, i) => (
          <Typography key={`${s.signal_type ?? s.type ?? 'macro'}-${i}`} variant="body2" sx={{ fontSize: '0.85rem' }}>
            <strong>{(s.signal_type ?? s.type ?? 'macro').replaceAll('_', ' ')}</strong>
            {' — '}
            {String(s.evidence ?? '').slice(0, 240)}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

function specialistRanLabel(comp, t) {
  if (comp.specialist_ran === true) return t('report.investigation.specialistRan');
  if (comp.specialist_ran === false) return t('report.investigation.specialistNotRan');
  return null;
}

function OperatorComponentStateBanner({ comp, t }) {
  const state = comp.operator_display_state;
  if (!state || state === 'assessed_claims') return null;
  const stateLabel = t(`report.operatorState.${state}`);
  const reason = comp.operator_state_reason;
  const reasonLabel = reason ? t(`report.operatorState.reason.${reason}`) : null;
  const severity = state === 'insufficient_data' ? 'warning' : 'info';
  const tierLabel = comp.specialist_tier
    ? t('report.investigation.specialistTier').replace('{tier}', String(comp.specialist_tier))
    : null;
  const ranLabel = specialistRanLabel(comp, t);
  return (
    <Alert severity={severity} sx={{ marginBottom: 1 }}>
      {stateLabel}
      {reasonLabel && reasonLabel !== `report.operatorState.reason.${reason}` && (
        <>
          {' — '}
          {reasonLabel}
        </>
      )}
      {(tierLabel || ranLabel) && (
        <Typography variant="body2" sx={{ marginTop: 0.5, opacity: 0.9 }}>
          {[tierLabel, ranLabel].filter(Boolean).join(' · ')}
        </Typography>
      )}
    </Alert>
  );
}

function InvestigationSummaryBanner({ summary, t }) {
  if (!summary || typeof summary !== 'object') return null;
  const show = summary.degrade_reason
    || summary.synthesis_mode === 'deterministic'
    || summary.synthesis_mode === 'cached'
    || (summary.signals_scoring_quarantined ?? 0) > 0
    || summary.budget_degrade_mode;
  if (!show) return null;

  const lines = [];
  if (summary.degrade_reason) {
    lines.push(t('report.investigation.degradeReason').replace('{reason}', String(summary.degrade_reason)));
  }
  if (summary.synthesis_mode === 'deterministic' || summary.synthesis_mode === 'cached') {
    lines.push(t('report.investigation.synthesisMode').replace('{mode}', String(summary.synthesis_mode)));
  }
  if ((summary.signals_scoring_quarantined ?? 0) > 0) {
    lines.push(
      t('report.investigation.scoringQuarantined').replace('{n}', String(summary.signals_scoring_quarantined)),
    );
  }
  if (summary.budget_degrade_mode) {
    lines.push(
      t('report.investigation.budgetDegrade').replace('{mode}', String(summary.budget_degrade_mode)),
    );
  }

  return (
    <Alert severity="info" sx={{ marginBottom: 2 }}>
      <Typography variant="cardTitle" sx={{ marginBottom: 0.5 }}>
        {t('report.investigation.summaryTitle')}
      </Typography>
      <Stack spacing={0.25}>
        {lines.map((line) => (
          <Typography key={line} variant="body2">{line}</Typography>
        ))}
      </Stack>
    </Alert>
  );
}

function EvidencePartitionPanel({ comp, t }) {
  const coverage = comp.coverage;
  if (!coverage) return null;
  const state = comp.operator_display_state;
  const usage = comp.evidence_usage_state;
  const show = state === 'specialist_skipped'
    || state === 'evidence_quarantined'
    || state === 'insufficient_data'
    || usage === 'field_anchor_only'
    || usage === 'mixed'
    || (coverage.investigation_used ?? 0) !== (coverage.scoring_used ?? 0)
    || (coverage.scoring_quarantined ?? 0) > 0;
  if (!show) return null;

  const rows = [];
  if ((coverage.investigation_used ?? 0) > 0) {
    rows.push(t('report.evidencePartition.investigationUsed').replace('{n}', String(coverage.investigation_used)));
  }
  if ((coverage.scoring_quarantined ?? 0) > 0) {
    rows.push(
      t('report.evidencePartition.scoringQuarantined').replace('{n}', String(coverage.scoring_quarantined)),
    );
  }
  if (usage === 'field_anchor_only' || usage === 'mixed') {
    if (coverage.scoring_used > 0) {
      rows.push(t('report.evidencePartition.fieldAnchor').replace('{n}', String(coverage.scoring_used)));
    }
  } else if (coverage.scoring_used > 0) {
    rows.push(t('report.evidencePartition.scoringUsed').replace('{n}', String(coverage.scoring_used)));
  }
  if (coverage.quarantined > 0) {
    rows.push(t('report.evidencePartition.quarantined').replace('{n}', String(coverage.quarantined)));
  }
  if (coverage.macro_context > 0) {
    rows.push(t('report.evidencePartition.macroContext').replace('{n}', String(coverage.macro_context)));
  }
  if (coverage.claims > 0) {
    rows.push(t('report.evidencePartition.claims').replace('{n}', String(coverage.claims)));
  }

  if (rows.length === 0) return null;

  return (
    <Box sx={(theme) => ({
      marginBottom: theme.spacing(1),
      padding: theme.spacing(1),
      borderRadius: `${theme.custom.radius.section}px`,
      border: theme.custom.border.hairline,
      backgroundColor: theme.palette.action.hover,
    })}
    >
      <Typography variant="meta" color="text.secondary" sx={{ display: 'block', marginBottom: 0.5 }}>
        {t('report.evidencePartition.title')}
      </Typography>
      <Stack spacing={0.25}>
        {rows.map((row) => (
          <Typography key={row} variant="body2" sx={{ fontSize: '0.85rem' }}>{row}</Typography>
        ))}
      </Stack>
    </Box>
  );
}

function ComponentCard({
  comp,
  t,
  sourceSignals,
  driftSeries,
  driftLoading,
  displayView = 'operator',
  flat = false,
  open,
  evidenceOpen,
  onToggle,
  onEvidenceToggle,
}) {
  const isAnalyst = displayView === 'analyst';
  const [showScoreDrift, setShowScoreDrift] = useState(false);
  const label = t(`comp.${comp.component_id}`) ?? comp.component_id.replaceAll('_', ' ');

  const isFiltered = sourceSignals !== null && sourceSignals !== undefined;
  const signals = isFiltered ? (sourceSignals ?? []) : null;
  const curatedEvidence = isFiltered ? null : (comp.evidence ?? []);
  const evidenceCount = isFiltered ? signals.length : curatedEvidence.length;
  const isInsufficient = comp.operator_display_state
    ? comp.operator_display_state === 'insufficient_data'
    : (comp.confidence === 'insufficient_data' || comp.instrument?.operator_shows_score === false);
  const showEvidenceAccordion = isAnalyst
    || !comp.operator_display_state
    || comp.operator_display_state === 'assessed_claims'
    || comp.operator_display_state === 'assessed_low_confidence'
    || (comp.coverage?.scoring_used ?? 0) > 0;
  const isContested = comp.instrument?.contested === true
    || comp.instrument?.contested_thin === true;

  return (
    <Accordion
      expanded={open}
      onChange={(_, expanded) => onToggle(expanded)}
      sx={(theme) => (flat
        ? flatAccordionSx(theme)
        : {
          marginBottom: theme.spacing(1),
          ...(isInsufficient ? {
            backgroundColor: theme.palette.action.hover,
          } : null),
        })}
    >
      <AccordionSummary
        sx={(theme) => ({
          ...(flat ? {
            minHeight: 56,
            [theme.breakpoints.down('sm')]: {
              minHeight: 60,
              py: 1.25,
            },
          } : null),
          '& .MuiAccordionSummary-content': {
            alignItems: flat ? 'center' : { xs: 'flex-start', sm: 'center' },
            minWidth: 0,
            margin: flat
              ? `${theme.spacing(0.75, 0)} !important`
              : `${theme.spacing(0.5, 0)} !important`,
            ...(flat ? {
              [theme.breakpoints.down('sm')]: {
                margin: `${theme.spacing(1, 0)} !important`,
              },
            } : null),
          },
        })}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={1}
          sx={{ width: '100%', minWidth: 0 }}
        >
          <Stack
            direction="row"
            alignItems="flex-start"
            spacing={1}
            sx={{ flex: 1, minWidth: 0, width: '100%' }}
          >
            {createElement(getComponentIcon(comp.component_id), {
              sx: (theme) => ({
                fontSize: theme.typography.sectionTitle.fontSize,
                color: theme.palette.text.secondary,
                marginTop: flat ? 0 : theme.spacing(0.25),
                flexShrink: 0,
              }),
            })}
            <Stack direction="column" spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" flexWrap="wrap" spacing={0.75} useFlexGap>
                <Typography
                  sx={(theme) => ({
                    fontWeight: 500,
                    textTransform: 'capitalize',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    lineHeight: 1.35,
                    fontSize: theme.typography.body2.fontSize,
                    [theme.breakpoints.up('sm')]: {
                      fontSize: theme.typography.body1.fontSize,
                    },
                  })}
                >
                  {label}
                </Typography>
                {isContested && <ContestedBadge t={t} />}
              </Stack>
            </Stack>
          </Stack>
          {isAnalyst && comp.instrument?.significant_delta && (
            <Stack
              direction="row"
              alignItems="center"
              flexWrap="wrap"
              spacing={0.75}
              useFlexGap
              sx={() => ({
                flexShrink: 0,
                width: { xs: '100%', sm: 'auto' },
                maxWidth: { xs: '100%', sm: '55%' },
                marginLeft: { xs: 0, sm: 'auto' },
                justifyContent: { xs: 'center', sm: 'flex-end' },
              })}
            >
              <Box sx={{ width: { xs: '100%', sm: 'auto' }, display: 'flex', justifyContent: { xs: 'center', sm: 'flex-end' } }}>
                <StatusTag variant="alert">{t('report.delta.significant')}</StatusTag>
              </Box>
            </Stack>
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {isAnalyst && <InstrumentMetricsBadges instrument={comp.instrument} t={t} />}
        {isAnalyst && (
          <Box sx={(theme) => ({ marginTop: theme.spacing(0.5), marginBottom: theme.spacing(0.75) })}>
            {driftLoading && (
              <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', display: 'block', marginBottom: 0.5 }}>
                {t('app.reportLoading')}
              </Typography>
            )}
            <DriftSparkline
              series={driftSeries ?? []}
              t={t}
              height={78}
              valueKey={showScoreDrift ? 'score' : 'polarization'}
              variant={showScoreDrift ? 'score10' : 'unit01'}
            />
            <Typography
              component="button"
              type="button"
              variant="caption"
              onClick={() => setShowScoreDrift((v) => !v)}
              sx={{
                border: 'none',
                background: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'primary.main',
                textDecoration: 'underline',
                marginTop: 0.5,
              }}
            >
              {showScoreDrift ? t('report.drift.hideScoreHistory') : t('report.drift.showScoreHistory')}
            </Typography>
          </Box>
        )}
        {isAnalyst && <WhyThisScore comp={comp} t={t} />}
        {isAnalyst && <DeltaLine comp={comp} t={t} />}
        {isAnalyst && <CounterfactualHint comp={comp} t={t} />}
        {comp.data_quality_caveat && String(comp.data_quality_caveat).trim() && (
          <Typography variant="caption" color="info.main" sx={{ display: 'block', marginBottom: 1 }}>
            {t('report.dataQualityCaveat')}: {comp.data_quality_caveat}
          </Typography>
        )}
        {!isAnalyst && <OperatorComponentStateBanner comp={comp} t={t} />}
        {!isAnalyst && <EvidencePartitionPanel comp={comp} t={t} />}
        <MarkdownArticle variant="report" markdown={expandSourceCitationLinks(comp.narrative ?? '')} />
        <EvidenceTreePanel
          evidenceTree={comp.evidence_tree}
          reasoningTraceId={comp.reasoning_trace_id}
          isAnalyst={isAnalyst}
        />
        {(comp.interpretive_summary || comp.instrument?.interpretive_summary) && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', marginTop: 1 }}>
            {t('report.narrative.interpretiveSummary')}
          </Typography>
        )}
        {isAnalyst && comp.narrative_grounding_score != null && comp.narrative_grounding_score < 1 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginTop: 0.5 }}>
            {t('report.narrative.groundingScore').replace('{score}', String(comp.narrative_grounding_score))}
          </Typography>
        )}
        {showEvidenceAccordion && evidenceCount > 0 && (
          <Accordion
            expanded={evidenceOpen}
            onChange={(_, expanded) => onEvidenceToggle(expanded)}
            sx={(theme) => (flat
              ? {
                marginTop: theme.spacing(0.5),
                borderRadius: '0 !important',
                border: 'none',
                borderTop: theme.custom.border.hairline,
                boxShadow: 'none',
                backgroundColor: 'transparent',
              }
              : { borderRadius: `${theme.custom.radius.section}px !important`, marginTop: theme.spacing(1.5), marginBottom: theme.spacing(1) })}
          >
            <AccordionSummary sx={(theme) => ({
              color: theme.palette.text.secondary,
              fontSize: theme.typography.meta.fontSize,
              fontWeight: 500,
            })}>
              <Typography variant="meta" component="span">
                {comp.operator_display_state === 'insufficient_data' && !isAnalyst
                  ? t('report.evidencePartition.rawScored')
                  : t('report.evidence')}
              </Typography>
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
                      key={`${s.source_type ?? 'src'}-${s.article_source ?? i}-${i}`}
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
                        {s.source_type === 'social' && <SourceBadge kind="social">{t('report.badge.social')}</SourceBadge>}
                        {s.source_type === 'pbo' && <SourceBadge kind="pbo">{t('report.badge.pbo')}</SourceBadge>}
                        {s.source_type === 'pbo' ? s.article_source?.replace(/^pbo-/, '') : s.article_source}
                        <GeoEpistemicBadge signal={s} t={t} />
                      </Box>
                      <Box component="span" sx={{ display: 'block' }}>{s.evidence}</Box>
                    </Box>
                  ))
                  : curatedEvidence.map((e, i) => (
                    <Box component="li" key={`evidence-${i}-${String(e).slice(0, 32)}`} sx={(theme) => ({ marginBottom: theme.spacing(0.75) })}>
                      <MarkdownArticle variant="report" markdown={expandSourceCitationLinks(e)} />
                    </Box>
                  ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}
        {Array.isArray(comp.manifestations_absent) && comp.manifestations_absent.length > 0 && (
          <Box sx={(theme) => ({ marginTop: theme.spacing(1) })}>
            <Typography variant="meta" color="text.secondary">{t('report.manifestations.absent')}</Typography>
            <Box component="ul" sx={{ margin: 0, paddingLeft: 2 }}>
              {comp.manifestations_absent.map((m) => (
                <Typography component="li" variant="body2" key={m}>{m}</Typography>
              ))}
            </Box>
          </Box>
        )}
        {isAnalyst && comp.media_mention_mass != null && comp.media_mention_mass > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginTop: 0.5 }}>
            {t('report.mediaMentionMass').replace('{value}', comp.media_mention_mass.toFixed(2))}
          </Typography>
        )}
        {isAnalyst && comp.suppression_delta != null && Math.abs(comp.suppression_delta) >= 1 && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', marginTop: 1 }}>
            {t('report.suppression.delta')
              .replace('{raw}', String(comp.score_raw ?? '—'))
              .replace('{headline}', String(comp.score_headline ?? comp.score ?? '—'))}
            {comp.suppression_breakdown && (
              <>
                {' · '}
                {t('report.suppression.breakdown')
                  .replace('{cap}', comp.suppression_breakdown.source_cap ?? '—')
                  .replace('{floor}', comp.suppression_breakdown.min_mass_floor ?? '—')}
              </>
            )}
          </Typography>
        )}
        {isAnalyst && comp.score_calibrated != null && (comp.calibration_trust ?? 1) < 1 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginTop: 0.5 }}>
            {t('report.calibration.component')
              .replace('{score}', String(comp.score_calibrated))
              .replace('{trust}', String(Math.round((comp.calibration_trust ?? 0) * 100)))}
          </Typography>
        )}
        {isAnalyst && comp.weight_sensitivity?.reliable && comp.weight_sensitivity?.band_width != null && (
          <Typography variant="caption" color={comp.weight_sensitivity.fragile ? 'warning.main' : 'text.secondary'} sx={{ display: 'block', marginTop: 0.5 }}>
            {t('report.weightSensitivity.band')
              .replace('{low}', String(comp.weight_sensitivity.perturbed_low ?? '—'))
              .replace('{high}', String(comp.weight_sensitivity.perturbed_high ?? '—'))
              .replace('{width}', String(comp.weight_sensitivity.band_width))}
          </Typography>
        )}
        {isAnalyst && <FacetBars facets={comp.facets} t={t} />}

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
  displayView = 'operator',
  readOnly = false,
  translating,
  translateError,
  reportDate,
  reportScope,
  generatedAt,
  driftByComponent,
  driftLoading,
  attentionItems,
  actionCompass,
  anomalyStrip,
  suggestCrisisBudget,
  driftAlerts,
  onJumpToComponent,
  openCompId: openCompIdProp,
  setOpenCompId: setOpenCompIdProp,
  openEvidenceCompId: openEvidenceCompIdProp,
  setOpenEvidenceCompId: setOpenEvidenceCompIdProp,
  showValidationReview = false,
  onOpenValidationInChat,
}) {
  const isAnalyst = displayView === 'analyst';
  const { t } = useLanguage();
  const theme = useTheme();
  const [openCompIdInternal, setOpenCompIdInternal] = useState(null);
  const [openEvidenceCompIdInternal, setOpenEvidenceCompIdInternal] = useState(null);
  const [componentFilter, setComponentFilter] = useState(() => (
    isAnalyst ? readReportComponentFilter(reportScope ?? 'national') : { preset: 'all', selectedComponentIds: null }
  ));
  const compRefs = useRef({});
  const validationReviewRef = useRef(null);
  const catalogProposalsRef = useRef(null);

  const openCompId = openCompIdProp ?? openCompIdInternal;
  const setOpenCompId = setOpenCompIdProp ?? setOpenCompIdInternal;
  const openEvidenceCompId = openEvidenceCompIdProp ?? openEvidenceCompIdInternal;
  const setOpenEvidenceCompId = setOpenEvidenceCompIdProp ?? setOpenEvidenceCompIdInternal;

  const norrisCaps = assessment.norris_capacities ?? [];
  const driftMap = driftByComponent ?? {};

  const [recommendations, setRecommendations] = useState(
    () => assessment?.operator_recommendations ?? [],
  );

  useEffect(() => {
    queueMicrotask(() => { setRecommendations(assessment?.operator_recommendations ?? []); });
  }, [assessment?.operator_recommendations, assessment?.date]);

  const visibleComponents = isAnalyst
    ? filterReportComponents(assessment.components ?? [], {
      preset: componentFilter.preset,
      selectedComponentIds: componentFilter.selectedComponentIds,
      attentionItems: attentionItems ?? [],
    })
    : (assessment.components ?? []);

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
      spacing={readOnly ? 2.5 : 4}
      aria-busy={translating ? 'true' : 'false'}
    >
      {translateError && (
        <Alert severity="error" variant="outlined">
          Translation error: {translateError}
        </Alert>
      )}

      <EpistemicStatusBanner
        assessment={assessment}
        displayView={displayView}
        attentionItems={attentionItems}
        suggestCrisisBudget={suggestCrisisBudget}
        generatedAt={generatedAt}
      />

      <ActionCompassPanel
        actionCompass={actionCompass}
        onJumpToComponent={onJumpToComponent}
      />

      <OovAnomalyClustersPanel
        oovBurst={assessment?.oov_burst}
        anomalyStrip={anomalyStrip}
        oovCaptureCount={assessment?.oov_capture_count}
        oovScoringApplied={assessment?.oov_scoring_applied}
        isAnalyst={isAnalyst}
        onReviewCatalogProposals={
          showValidationReview && isAnalyst
            ? () => catalogProposalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            : undefined
        }
      />

      {isAnalyst && (
        <EvidenceOverviewPanel
          assessment={assessment}
          reportScope={reportScope}
          displayView={displayView}
        />
      )}

      <AttentionPanel
        items={attentionItems}
        driftAlerts={driftAlerts}
        displayView={displayView}
        onJumpToComponent={onJumpToComponent}
        onScrollToValidationReview={showValidationReview ? () => {
          validationReviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } : undefined}
      />

      {isAnalyst && (
        <AgentDivergencePanel
          reportDate={reportDate ?? assessment?.date}
          reportScope={reportScope?.id ?? assessment?.report_scope?.id ?? 'national'}
          assessmentDegraded={assessment?.assessment_degraded ?? null}
          agentTraceId={assessment?.agent_trace_id ?? null}
        />
      )}
      <DecisionBriefPanel
        decisionBrief={assessment?.decision_brief}
        retrievalGaps={assessment?.retrieval_gaps}
      />

      <OperatorRecommendationsPanel
        recommendations={recommendations}
        reportDate={reportDate ?? assessment?.date}
        reportScope={reportScope ?? assessment?.report_scope?.id ?? 'national'}
        onUpdated={(updated) => {
          setRecommendations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        }}
      />

      {isAnalyst && (
        <ReportComponentFilterBar
          reportScope={reportScope ?? assessment?.report_scope?.id ?? 'national'}
          filterState={componentFilter}
          onFilterChange={setComponentFilter}
        />
      )}

      {showValidationReview && (
        <ValidationReviewPanel
          ref={validationReviewRef}
          reportDate={reportDate}
          reportScope={reportScope}
          enabled={showValidationReview}
          onOpenInChat={onOpenValidationInChat}
        />
      )}

      {showValidationReview && (
        <Box ref={catalogProposalsRef}>
          <CatalogProposalPanel enabled={showValidationReview} />
        </Box>
      )}

      <MacroSignalsSection macroSignals={assessment.macro_signals} t={t} isAnalyst={isAnalyst} />

      {isAnalyst && Array.isArray(norrisCaps) && norrisCaps.length > 0 && (
        <ReportSection flat={readOnly} title={t('report.norris.titleDiagnostic') ?? t('report.norris.title')}>
          <Box
            sx={(theme) => (readOnly
              ? {
                border: theme.custom.border.hairline,
                borderRadius: `${theme.custom.radius.section}px`,
                overflow: 'hidden',
                background: theme.palette.background.paper,
              }
              : undefined)}
          >
            <Stack spacing={readOnly ? 0 : 1.5}>
              {norrisCaps.map((cap, capIndex) => (
              <Box
                key={cap.capacity_id}
                sx={(theme) => (readOnly
                  ? {
                    padding: theme.spacing(1.5),
                    background: theme.palette.background.default,
                    borderBottom: capIndex < norrisCaps.length - 1
                      ? theme.custom.border.hairline
                      : 'none',
                  }
                  : {
                    border: theme.custom.border.hairline,
                    borderRadius: `${theme.custom.radius.section}px`,
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
                    {cap.confidence && (
                      <StatusTag variant="neutral">
                        {t(`confidence.${cap.confidence ?? 'medium'}`)}
                      </StatusTag>
                    )}
                  </Stack>
                </Stack>

                <Stack
                  direction="row"
                  flexWrap="wrap"
                  sx={(theme) => ({ gap: theme.spacing(1), marginTop: 1 })}
                >
                  <StatusTag variant="neutral">
                    {t('norris.diag.robustness') ?? 'robustness'} {fmt01(cap.diagnostics?.robustness)}
                  </StatusTag>
                  <StatusTag variant="neutral">
                    {t('norris.diag.redundancy') ?? 'redundancy'} {fmt01(cap.diagnostics?.redundancy)}
                  </StatusTag>
                  <StatusTag variant="neutral">
                    {t('norris.diag.rapidity') ?? 'rapidity'} {formatNorrisRapidity(cap.diagnostics?.rapidity)}
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
          </Box>
        </ReportSection>
      )}

      <ReportSection flat={readOnly} title={t('report.executiveSummary')}>
        <Box
          sx={{
            maxWidth: 960,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {!isAnalyst && (
            <InvestigationSummaryBanner summary={assessment.investigation_summary} t={t} />
          )}
          {!isAnalyst && assessment?.headline_band && (
            <Box sx={{ mb: 1, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Box
                component="span"
                sx={(theme) => ({
                  fontSize: '0.8rem',
                  px: 1,
                  py: 0.25,
                  borderRadius: '4px',
                  border: `1px solid ${theme.palette.divider}`,
                  color: theme.palette.text.secondary,
                })}
              >
                {t('report.headline.band')
                  .replace('{low}', t(`report.instrument.certainty.${assessment.headline_band.low}`))
                  .replace('{high}', t(`report.instrument.certainty.${assessment.headline_band.high}`))}
              </Box>
              {assessment.narrative_score_divergence && (
                <Box
                  component="span"
                  sx={(theme) => ({
                    fontSize: '0.8rem',
                    px: 1,
                    py: 0.25,
                    borderRadius: '4px',
                    border: `1px solid ${theme.palette.warning.main}`,
                    color: theme.palette.warning.dark,
                  })}
                >
                  {t('report.headline.divergence')}
                </Box>
              )}
            </Box>
          )}
          <MarkdownArticle
            variant="report"
            markdown={expandSourceCitationLinks(assessment.cross_component_synthesis ?? '')}
          />
        </Box>
      </ReportSection>

      <ReportSection flat={readOnly} title={t('report.components')}>
        <Box
          sx={(theme) => (readOnly
            ? {
              border: theme.custom.border.hairline,
              borderRadius: `${theme.custom.radius.section}px`,
              overflow: 'hidden',
              background: theme.palette.background.paper,
              minWidth: 0,
              [theme.breakpoints.down('sm')]: {
                overflow: 'visible',
              },
            }
            : { minWidth: 0 })}
        >
          {(visibleComponents).map((c, componentIndex, componentList) => (
            <Box
              key={c.component_id}
              ref={(el) => {
                if (el) compRefs.current[c.component_id] = el;
              }}
              sx={(theme) => (readOnly && componentIndex < componentList.length - 1
                ? { borderBottom: theme.custom.border.hairline }
                : undefined)}
            >
              <ComponentCard
                comp={c}
                t={t}
                displayView={displayView}
                flat={readOnly}
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
        </Box>
      </ReportSection>

      {assessment.media_bias_caveats && (
        <ReportSection flat={readOnly} title={t('report.caveats')}>
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

SourceBadge.propTypes = {
  kind: sourceKindPropType,
  children: PropTypes.node,
};

ReportSection.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
  flat: PropTypes.bool,
};

DeltaAdornment.propTypes = {
  delta: PropTypes.number,
  significant: PropTypes.bool,
  t: translationFnPropType,
};

InstrumentStateBadges.propTypes = {
  instrument: PropTypes.object,
  t: translationFnPropType,
};

ContestedBadge.propTypes = {
  t: translationFnPropType,
};

WhyThisScore.propTypes = {
  comp: componentScoreShape.isRequired,
  t: translationFnPropType,
};

CounterfactualHint.propTypes = {
  comp: componentScoreShape.isRequired,
  t: translationFnPropType,
};

FacetBars.propTypes = {
  facets: facetsShape,
  t: translationFnPropType,
};

DeltaLine.propTypes = {
  comp: componentScoreShape.isRequired,
  t: translationFnPropType,
};

MacroSignalsSection.propTypes = {
  macroSignals: PropTypes.arrayOf(macroSignalShape),
  t: translationFnPropType,
  isAnalyst: PropTypes.bool,
};

ComponentCard.propTypes = {
  comp: componentScoreShape.isRequired,
  t: translationFnPropType,
  sourceSignals: PropTypes.arrayOf(PropTypes.object),
  driftSeries: PropTypes.array,
  driftLoading: PropTypes.bool,
  displayView: PropTypes.oneOf(['operator', 'analyst']),
  flat: PropTypes.bool,
  open: PropTypes.bool,
  evidenceOpen: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
  onEvidenceToggle: PropTypes.func.isRequired,
};

OperatorComponentStateBanner.propTypes = {
  comp: componentScoreShape.isRequired,
  t: translationFnPropType,
};

InvestigationSummaryBanner.propTypes = {
  summary: PropTypes.object,
  t: translationFnPropType,
};

EvidencePartitionPanel.propTypes = {
  comp: componentScoreShape.isRequired,
  t: translationFnPropType,
};

ReportView.propTypes = {
  assessment: assessmentShape.isRequired,
  scoreBySource: scoreBySourceShape,
  displayView: PropTypes.oneOf(['operator', 'analyst']),
  readOnly: PropTypes.bool,
  translating: PropTypes.bool,
  translateError: PropTypes.string,
  reportDate: PropTypes.string,
  reportScope: PropTypes.string,
  generatedAt: PropTypes.string,
  driftByComponent: driftByComponentShape,
  driftLoading: PropTypes.bool,
  attentionItems: PropTypes.arrayOf(PropTypes.object),
  actionCompass: PropTypes.shape({
    uncertainty_band: PropTypes.string,
    actions: PropTypes.arrayOf(PropTypes.object),
  }),
  anomalyStrip: PropTypes.shape({
    level: PropTypes.string,
    clusters: PropTypes.arrayOf(PropTypes.object),
    show_operator: PropTypes.bool,
  }),
  suggestCrisisBudget: PropTypes.bool,
  driftAlerts: PropTypes.arrayOf(PropTypes.object),
  onJumpToComponent: PropTypes.func,
  openCompId: PropTypes.string,
  setOpenCompId: PropTypes.func,
  openEvidenceCompId: PropTypes.string,
  setOpenEvidenceCompId: PropTypes.func,
  showValidationReview: PropTypes.bool,
  onOpenValidationInChat: PropTypes.func,
};
