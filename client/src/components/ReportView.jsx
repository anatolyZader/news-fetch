import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Alert from '@mui/material/Alert';
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
import { ResilienceSummaryCard, StatusTag, MarkdownArticle } from '../ui/index.js';

const COMPONENT_ICONS = {
  narrative:                 MenuBookOutlinedIcon,
  information_communication: CellTowerOutlinedIcon,
  lifesaving_behavior:       HealthAndSafetyOutlinedIcon,
  functional_continuity:     SettingsOutlinedIcon,
  community_capital:         HandshakeOutlinedIcon,
  leadership:                SupervisorAccountOutlinedIcon,
  belonging_solidarity:      Diversity3OutlinedIcon,
  wellbeing_atrisk:          MonitorHeartOutlinedIcon,
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

function ComponentChip({ label, variant, value, t }) {
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
    </Stack>
  );
}

function ComponentCard({
  comp,
  t,
  sourceSignals,
  open,
  evidenceOpen,
  onToggle,
  onEvidenceToggle,
}) {
  const Icon = getComponentIcon(comp.component_id);
  const label = t(`comp.${comp.component_id}`) ?? comp.component_id.replace(/_/g, ' ');
  const confidenceLabel = t(`confidence.${comp.confidence}`) ?? comp.confidence;

  const isFiltered = sourceSignals !== null && sourceSignals !== undefined;
  const signals = isFiltered ? (sourceSignals ?? []) : null;
  const curatedEvidence = isFiltered ? null : (comp.evidence ?? []);
  const evidenceCount = isFiltered ? signals.length : curatedEvidence.length;

  return (
    <Accordion
      expanded={open}
      onChange={(_, expanded) => onToggle(expanded)}
      sx={(theme) => ({ marginBottom: theme.spacing(1) })}
    >
      <AccordionSummary>
        <Icon
          sx={(theme) => ({
            fontSize: theme.typography.sectionTitle.fontSize,
            color: theme.palette.text.secondary,
            marginRight: theme.spacing(1),
          })}
        />
        <Typography sx={{ flex: 1, fontWeight: 500, textTransform: 'capitalize' }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {confidenceLabel}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <MarkdownArticle variant="report" markdown={expandSourceCitationLinks(comp.narrative ?? '')} />

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
  readOnly: _readOnly,
  translating,
  translateError,
  openCompId: openCompIdProp,
  setOpenCompId: setOpenCompIdProp,
  openEvidenceCompId: openEvidenceCompIdProp,
  setOpenEvidenceCompId: setOpenEvidenceCompIdProp,
}) {
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
          />
        ))}
      </Box>

      <ReportSection title={t('report.executiveSummary')}>
        <MarkdownArticle
          variant="report"
          markdown={expandSourceCitationLinks(assessment.cross_component_synthesis ?? '')}
        />
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
              sourceSignals={getSourceSignals(c.component_id)}
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
