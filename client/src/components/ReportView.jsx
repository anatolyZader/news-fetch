import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Alert from '@mui/material/Alert';
import { useTheme, alpha } from '@mui/material/styles';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CellTowerOutlinedIcon from '@mui/icons-material/CellTowerOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import SupervisorAccountOutlinedIcon from '@mui/icons-material/SupervisorAccountOutlined';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import { evidenceAnchorId } from '../../../business_modules/resilience_scorer/domain/contracts/evidenceAnchor.js';
import { expandSourceCitationLinks } from './ReportMarkdownView.jsx';
import {
  formatNarrativeMarkdown,
  formatEvidenceMarkdown,
} from '../lib/formatSourceCitations.js';
import {
  formatEvidenceArticleSource,
  groupEvidenceBySourceType,
  normalizeEvidenceSourceType,
  resolveEvidenceSourceMeta,
  stripTrailingEvidenceCitation,
} from '../lib/evidenceSourceMeta.js';
import { isStubNarrative } from '../lib/isStubNarrative.js';
import { safeExternalUrl } from '../lib/safeExternalUrl.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { MarkdownArticle } from '../ui/index.js';
import { ReportEditionContextBar } from './ReportEditionContextBar.jsx';
import { DecisionBriefPanel } from './DecisionBriefPanel.jsx';
import {
  EvidenceNavigationProvider,
  createEvidenceAnchorNavigator,
  evidenceNavigationMarkdownComponents,
  useExpandedSourceGroups,
} from '../lib/evidenceNavigation.jsx';
import { EpistemicRoleBadge } from './EpistemicRoleBadge.jsx';
import PropTypes from 'prop-types';
import {
  assessmentShape,
  componentScoreShape,
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

const SOURCE_KINDS = new Set(['visits', 'radio', 'naftali', 'press', 'pbo', 'social']);

function SourceBadge({ kind, children }) {
  const safeKind = SOURCE_KINDS.has(kind) ? kind : 'visits';
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

function resolveHighlightedEvidenceItems(isRichMode, curatedEvidence, isFiltered, signals) {
  if (isRichMode) return curatedEvidence ?? [];
  if (isFiltered) return signals;
  return curatedEvidence;
}

export function resolveCuratedEvidence(comp) {
  if (comp.evidence_operator_structured?.length) return comp.evidence_operator_structured;
  if (comp.evidence_operator?.length) return comp.evidence_operator;
  if (comp.evidence?.length) return comp.evidence;
  return null;
}

function evidenceItemMarkdown(item) {
  if (typeof item === 'string') return item;
  return item?.markdown ?? item?.text ?? item?.evidence ?? '';
}

function stripEvidenceBulletPrefix(markdown) {
  if (typeof markdown !== 'string') return '';
  return markdown.replace(/^\s*-\s+/, '');
}

function evidenceItemKey(item, index) {
  const md = evidenceItemMarkdown(item);
  return `evidence-${index}-${md.slice(0, 32)}`;
}

function formatEvidenceBodyMarkdown(item, sourceSignals, formatEvidenceMd) {
  const raw = stripEvidenceBulletPrefix(evidenceItemMarkdown(item));
  const meta = resolveEvidenceSourceMeta(item, sourceSignals);
  const body = (meta?.source_type || meta?.article_source)
    ? stripTrailingEvidenceCitation(raw)
    : raw;
  return formatEvidenceMd(body);
}

function evidenceListItemSx(theme, { highlighted = false } = {}) {
  const base = {
    display: 'block',
    marginBottom: theme.spacing(1.5),
    lineHeight: theme.typography.body2.lineHeight,
    scrollMarginBlock: theme.spacing(2),
    transition: theme.transitions.create(['background-color', 'box-shadow'], {
      duration: theme.transitions.duration.standard,
    }),
  };
  if (!highlighted) return base;
  return {
    ...base,
    backgroundColor: alpha(theme.palette.primary.main, 0.1),
    borderRadius: `${theme.custom.radius.section}px`,
    marginLeft: theme.spacing(-1),
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
    paddingTop: theme.spacing(0.75),
    paddingBottom: theme.spacing(0.75),
    boxShadow: `inset 3px 0 0 ${theme.palette.primary.main}`,
  };
}

function evidenceItemUrl(item, meta) {
  if (typeof item === 'object' && item) {
    const url = safeExternalUrl(item.url ?? item.article_url);
    if (url) return url;
  }
  return safeExternalUrl(meta?.url ?? meta?.article_url);
}

function evidenceListDomId(componentId, item, _index) {
  if (typeof item === 'object' && item?.ref && componentId) {
    return evidenceAnchorId(componentId, item.ref);
  }
  return undefined;
}

function EvidenceSourceHeader({ item, sourceSignals, t }) {
  const meta = resolveEvidenceSourceMeta(item, sourceSignals);
  if (!meta?.source_type && !meta?.article_source) return null;
  const sourceType = normalizeEvidenceSourceType(meta.source_type)
    ?? meta.source_type;
  const articleSourceLabel = formatEvidenceArticleSource(meta, sourceType);
  const externalUrl = evidenceItemUrl(item, meta);
  return (
    <Box
      component="span"
      sx={(theme) => ({
        fontWeight: 600,
        color: theme.palette.text.secondary,
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing(0.5),
        marginBottom: theme.spacing(0.5),
      })}
    >
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
      {(sourceType === 'visits' || sourceType === 'field') && (
        <SourceBadge kind="visits">{t('report.badge.visits')}</SourceBadge>
      )}
      {sourceType === 'radio' && <SourceBadge kind="radio">{t('report.badge.radio')}</SourceBadge>}
      {sourceType === 'naftali' && <SourceBadge kind="naftali">{t('report.badge.naftali')}</SourceBadge>}
      {(sourceType === 'news' || sourceType === 'press') && (
        <SourceBadge kind="press">{t('report.badge.press')}</SourceBadge>
      )}
      {sourceType === 'social' && <SourceBadge kind="social">{t('report.badge.social')}</SourceBadge>}
      {sourceType === 'pbo' && <SourceBadge kind="pbo">{t('report.badge.pbo')}</SourceBadge>}
      {articleSourceLabel}
      <GeoEpistemicBadge signal={meta} t={t} />
      {typeof item === 'object' && item?.operator_epistemic_role && (
        <EpistemicRoleBadge role={item.operator_epistemic_role} t={t} />
      )}
      </Box>
      {externalUrl && (
        <IconButton
          component="a"
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          size="small"
          aria-label={t('report.evidence.openSource')}
          sx={(theme) => ({
            flexShrink: 0,
            color: theme.palette.primary.main,
            padding: theme.spacing(0.25),
          })}
        >
          <OpenInNewIcon sx={{ fontSize: '1rem' }} />
        </IconButton>
      )}
    </Box>
  );
}

EvidenceSourceHeader.propTypes = {
  item: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  sourceSignals: PropTypes.arrayOf(PropTypes.object),
  t: PropTypes.func.isRequired,
};

function resolveComponentSignals(curatedEvidence, allowRawSignalFallback, sourceSignals) {
  if (curatedEvidence) return null;
  if (allowRawSignalFallback) return sourceSignals ?? [];
  return null;
}

function componentIsInsufficient(comp) {
  if (comp.operator_display_state) {
    return comp.operator_display_state === 'insufficient_data';
  }
  return comp.confidence === 'insufficient_data' || comp.instrument?.operator_shows_score === false;
}

function evidenceAccordionTitle({ isFiltered, operatorDisplayState, t }) {
  if (operatorDisplayState === 'insufficient_data' && isFiltered) {
    return t('report.evidencePartition.rawScored');
  }
  return t('report.supportingEvidence');
}

function findSourceBucketForAnchor(anchorId, componentId, items, sourceSignals) {
  if (!anchorId || !items?.length) return null;
  const groups = groupEvidenceBySourceType(items, sourceSignals);
  for (const { key, items: groupItems } of groups) {
    for (const item of groupItems) {
      if (evidenceListDomId(componentId, item, 0) === anchorId) return key;
    }
  }
  return null;
}

function sourceSectionLabel(bucketKey, t) {
  const key = `report.evidence.sourceSection.${bucketKey}`;
  const label = t(key);
  return label === key ? bucketKey : label;
}

function EvidenceBySourceList({
  items,
  sourceSignals,
  formatEvidenceMd,
  t,
  componentId,
  expandedSourceGroups,
  onToggleSourceGroup,
  highlightedAnchorId = null,
}) {
  const groups = groupEvidenceBySourceType(items, sourceSignals);
  if (groups.length === 0) return null;

  return (
    <Stack spacing={0.5}>
      {groups.map(({ key, items: groupItems }) => (
        <Accordion
          key={key}
          expanded={expandedSourceGroups?.has(key) ?? false}
          onChange={(_, expanded) => onToggleSourceGroup?.(key, expanded)}
          disableGutters
          sx={(theme) => ({
            border: theme.custom.border.hairline,
            borderRadius: `${theme.custom.radius.section}px !important`,
            '&:before': { display: 'none' },
          })}
        >
          <AccordionSummary
            sx={(theme) => ({
              minHeight: 40,
              color: theme.palette.text.secondary,
              fontSize: theme.typography.meta.fontSize,
              fontWeight: 500,
            })}
          >
            <Typography variant="meta" component="span">
              {sourceSectionLabel(key, t)}
            </Typography>
            <Typography variant="caption" component="span" sx={{ marginLeft: 'auto', opacity: 0.7 }}>
              {groupItems.length} {t('report.items')}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box component="ul" sx={(theme) => ({ paddingLeft: theme.spacing(2.5), margin: 0 })}>
              {groupItems.map((item, i) => {
                const domId = evidenceListDomId(componentId, item, i);
                const highlighted = Boolean(domId && domId === highlightedAnchorId);
                return (
                <Box
                  component="li"
                  key={evidenceItemKey(item, i)}
                  id={domId}
                  data-source-bucket={key}
                  data-evidence-ref={typeof item === 'object' ? (item.ref ?? '') : ''}
                  sx={(theme) => evidenceListItemSx(theme, { highlighted })}
                >
                  <EvidenceSourceHeader item={item} sourceSignals={sourceSignals} t={t} />
                  <MarkdownArticle
                    variant="report"
                    markdown={formatEvidenceBodyMarkdown(item, sourceSignals, formatEvidenceMd)}
                  />
                </Box>
                );
              })}
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}
    </Stack>
  );
}

EvidenceBySourceList.propTypes = {
  items: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.object])),
  sourceSignals: PropTypes.arrayOf(PropTypes.object),
  formatEvidenceMd: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
  componentId: PropTypes.string,
  expandedSourceGroups: PropTypes.instanceOf(Set),
  onToggleSourceGroup: PropTypes.func,
  highlightedAnchorId: PropTypes.string,
};

export function ComponentCard({
  comp,
  t,
  reportDate,
  citationRegistryEntries = null,
  sourceSignals,
  flat = false,
  open,
  evidenceOpen,
  autoExpandFirstSourceGroup = false,
  onToggle,
  onEvidenceToggle,
  onAskAi = null,
}) {
  const theme = useTheme();
  const label = t(`comp.${comp.component_id}`) ?? comp.component_id.replaceAll('_', ' ');

  const curatedEvidence = resolveCuratedEvidence(comp);
  const narrativeBody = String(comp.narrative_operator ?? comp.narrative ?? '').trim();
  const narrativeIsStub = isStubNarrative(narrativeBody);
  const isRichMode = comp.operator_surface_mode === 'rich';
  const fullPool = comp.operator_investigation_pool ?? [];
  const allowRawSignalFallback = !narrativeIsStub || Boolean(curatedEvidence?.length);
  const signals = isRichMode ? null : resolveComponentSignals(curatedEvidence, allowRawSignalFallback, sourceSignals);
  const isFiltered = Boolean(signals?.length);
  const highlightedCount = curatedEvidence?.length ?? 0;
  const poolCount = fullPool.length;
  const evidenceCount = isRichMode
    ? Math.max(highlightedCount, poolCount)
    : (curatedEvidence?.length ?? signals?.length ?? 0);
  const showEvidenceAccordion = evidenceCount > 0;
  const { expandedSourceGroups, openSourceGroup, toggleSourceGroup } = useExpandedSourceGroups();
  const [highlightedAnchorId, setHighlightedAnchorId] = useState(null);
  const [fullPoolOpen, setFullPoolOpen] = useState(false);
  const primaryEvidenceItems = resolveHighlightedEvidenceItems(
    isRichMode,
    curatedEvidence,
    isFiltered,
    signals,
  );

  const resolveAnchorTarget = useCallback((anchorId) => {
    const primaryBucket = findSourceBucketForAnchor(
      anchorId,
      comp.component_id,
      primaryEvidenceItems,
      sourceSignals,
    );
    if (primaryBucket) return { bucket: primaryBucket, inFullPoolOnly: false };

    const fullPoolBucket = findSourceBucketForAnchor(
      anchorId,
      comp.component_id,
      fullPool,
      sourceSignals,
    );
    if (fullPoolBucket) return { bucket: fullPoolBucket, inFullPoolOnly: true };

    return { bucket: null, inFullPoolOnly: false };
  }, [comp.component_id, primaryEvidenceItems, fullPool, sourceSignals]);

  const openEvidenceAccordion = useCallback(() => {
    if (!evidenceOpen) onEvidenceToggle(true);
  }, [evidenceOpen, onEvidenceToggle]);
  // Tour-driven evidence step: collapsed source groups would leave the
  // spotlighted accordion showing only headers, so open the first group.
  useEffect(() => {
    if (!autoExpandFirstSourceGroup || !evidenceOpen) return;
    const firstKey = groupEvidenceBySourceType(primaryEvidenceItems, sourceSignals)[0]?.key;
    if (firstKey) openSourceGroup(firstKey);
  }, [autoExpandFirstSourceGroup, evidenceOpen, primaryEvidenceItems, sourceSignals, openSourceGroup]);
  const openFullPoolAccordion = useCallback(() => {
    setFullPoolOpen(true);
  }, [setFullPoolOpen]);
  const navigateToAnchor = useMemo(
    () => createEvidenceAnchorNavigator(
      openEvidenceAccordion,
      openSourceGroup,
      setHighlightedAnchorId,
      {
        transitionMs: theme.transitions.duration.standard,
        resolveAnchorTarget,
        openFullPoolAccordion,
      },
    ),
    [
      openEvidenceAccordion,
      openSourceGroup,
      resolveAnchorTarget,
      openFullPoolAccordion,
      theme.transitions.duration.standard,
    ],
  );
  const citationOpts = { componentId: comp.component_id };
  const formatNarrativeMd = (markdown) => formatNarrativeMarkdown(
    markdown,
    reportDate,
    expandSourceCitationLinks,
    citationRegistryEntries,
    citationOpts,
  );
  const formatEvidenceMd = (markdown) => formatEvidenceMarkdown(
    markdown,
    reportDate,
    expandSourceCitationLinks,
    citationRegistryEntries,
    citationOpts,
  );
  const isInsufficient = componentIsInsufficient(comp);
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
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {onAskAi && (
          <Button
            type="button"
            variant="outlined"
            size="small"
            startIcon={<ChatOutlinedIcon sx={{ fontSize: '1rem !important' }} />}
            onClick={() => onAskAi(comp.component_id, label)}
            sx={(theme) => ({
              marginBottom: theme.spacing(1),
              padding: theme.spacing(0.5, 1.25),
              minHeight: 32,
              borderRadius: `${theme.custom.radius.control ?? theme.custom.radius.section}px`,
              borderColor: alpha(theme.palette.primary.main, 0.4),
              backgroundColor: alpha(theme.palette.primary.main, 0.06),
              color: theme.palette.primary.dark,
              fontSize: theme.typography.caption.fontSize,
              fontWeight: 600,
              textTransform: 'none',
              boxShadow: 'none',
              '&:hover': {
                borderColor: theme.palette.primary.main,
                backgroundColor: alpha(theme.palette.primary.main, 0.12),
                boxShadow: theme.custom.elevation?.hover,
              },
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
            })}
          >
            {t('report.askAi') || 'Ask AI about this component'}
          </Button>
        )}
        {isRichMode && comp.data_quality_caveat && String(comp.data_quality_caveat).trim() && (
          <Typography variant="caption" color="info.main" sx={{ display: 'block', marginBottom: 1 }}>
            {t('report.dataQualityCaveat')}: {comp.data_quality_caveat}
          </Typography>
        )}
        <Box data-tour="component-narrative">
          <EvidenceNavigationProvider onNavigateToAnchor={navigateToAnchor}>
            <MarkdownArticle
              variant="report"
              markdown={formatNarrativeMd(narrativeBody)}
              components={evidenceNavigationMarkdownComponents()}
            />
          </EvidenceNavigationProvider>
        </Box>
        {showEvidenceAccordion && evidenceCount > 0 && (
          <Accordion
            data-tour="component-evidence"
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
                {isRichMode
                  ? t('report.evidence.highlighted')
                  : evidenceAccordionTitle({
                    isFiltered,
                    operatorDisplayState: comp.operator_display_state,
                    t,
                  })}
              </Typography>
              <Typography variant="caption" component="span" sx={{ marginLeft: 'auto', opacity: 0.7 }}>
                {isRichMode ? highlightedCount : evidenceCount} {t('report.items')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={(theme) => ({
              gap: theme.spacing(1),
              fontSize: theme.typography.body2.fontSize,
            })}>
              {isFiltered && !isRichMode && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginBottom: 0.5 }}>
                  {t('report.evidence.rawSourceHint')}
                </Typography>
              )}
              <EvidenceBySourceList
                items={primaryEvidenceItems}
                sourceSignals={sourceSignals}
                formatEvidenceMd={formatEvidenceMd}
                t={t}
                componentId={comp.component_id}
                expandedSourceGroups={expandedSourceGroups}
                onToggleSourceGroup={toggleSourceGroup}
                highlightedAnchorId={highlightedAnchorId}
              />
            </AccordionDetails>
          </Accordion>
        )}
        {isRichMode && poolCount > 0 && (
          <Accordion
            expanded={fullPoolOpen}
            onChange={(_, expanded) => setFullPoolOpen(expanded)}
            sx={(theme) => ({
              borderRadius: `${theme.custom.radius.section}px !important`,
              marginTop: theme.spacing(1),
              marginBottom: theme.spacing(1),
            })}
          >
            <AccordionSummary sx={(theme) => ({
              color: theme.palette.text.secondary,
              fontSize: theme.typography.meta.fontSize,
              fontWeight: 500,
            })}>
              <Typography variant="meta" component="span">
                {t('report.evidence.fullPool')}
              </Typography>
              <Typography variant="caption" component="span" sx={{ marginLeft: 'auto', opacity: 0.7 }}>
                {poolCount} {t('report.items')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <EvidenceBySourceList
                items={fullPool}
                sourceSignals={sourceSignals}
                formatEvidenceMd={formatEvidenceMd}
                t={t}
                componentId={comp.component_id}
                expandedSourceGroups={expandedSourceGroups}
                onToggleSourceGroup={toggleSourceGroup}
                highlightedAnchorId={highlightedAnchorId}
              />
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
  readOnly = false,
  translating,
  translateError,
  reportDate,
  reportScope,
  generatedAt,
  assessmentWindow,
  openCompId: openCompIdProp,
  setOpenCompId: setOpenCompIdProp,
  openEvidenceCompId: openEvidenceCompIdProp,
  setOpenEvidenceCompId: setOpenEvidenceCompIdProp,
  onAskAiComponent = null,
}) {
  const { t } = useLanguage();
  const theme = useTheme();
  const [openCompIdInternal, setOpenCompIdInternal] = useState(null);
  const [openEvidenceCompIdInternal, setOpenEvidenceCompIdInternal] = useState(null);
  const compRefs = useRef({});

  const openCompId = openCompIdProp ?? openCompIdInternal;
  const setOpenCompId = setOpenCompIdProp ?? setOpenCompIdInternal;
  const openEvidenceCompId = openEvidenceCompIdProp ?? openEvidenceCompIdInternal;
  const setOpenEvidenceCompId = setOpenEvidenceCompIdProp ?? setOpenEvidenceCompIdInternal;

  const visibleComponents = assessment.components ?? [];

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
          {t('report.translateError')}
        </Alert>
      )}

      <ReportEditionContextBar
        reportScope={reportScope ?? assessment?.report_scope?.id ?? 'national'}
        reportDate={reportDate ?? assessment?.date}
        generatedAt={generatedAt}
        assessmentWindow={assessmentWindow}
      />

      <DecisionBriefPanel
        decisionBrief={assessment?.decision_brief}
        retrievalGaps={assessment?.retrieval_gaps}
      />

      <ReportSection flat={readOnly} title={t('report.executiveSummary')}>
        <Box
          sx={{
            maxWidth: 960,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <MarkdownArticle
            variant="report"
            markdown={formatNarrativeMarkdown(
              assessment.cross_component_synthesis_operator
                ?? assessment.cross_component_synthesis
                ?? '',
              assessment.date,
              expandSourceCitationLinks,
              assessment.narrative_citation_registry?.entries,
            )}
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
                reportDate={assessment.date}
                citationRegistryEntries={assessment.narrative_citation_registry?.entries}
                flat={readOnly}
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
                onAskAi={onAskAiComponent}
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

ContestedBadge.propTypes = {
  t: translationFnPropType,
};

ComponentCard.propTypes = {
  comp: componentScoreShape.isRequired,
  t: translationFnPropType,
  reportDate: PropTypes.string,
  citationRegistryEntries: PropTypes.arrayOf(PropTypes.object),
  sourceSignals: PropTypes.arrayOf(PropTypes.object),
  flat: PropTypes.bool,
  open: PropTypes.bool,
  evidenceOpen: PropTypes.bool,
  autoExpandFirstSourceGroup: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
  onEvidenceToggle: PropTypes.func.isRequired,
  onAskAi: PropTypes.func,
};

ReportView.propTypes = {
  assessment: assessmentShape.isRequired,
  scoreBySource: scoreBySourceShape,
  readOnly: PropTypes.bool,
  translating: PropTypes.bool,
  translateError: PropTypes.string,
  reportDate: PropTypes.string,
  reportScope: PropTypes.string,
  generatedAt: PropTypes.string,
  assessmentWindow: PropTypes.shape({
    days: PropTypes.number,
    report_date: PropTypes.string,
    window_start: PropTypes.string,
    window_end: PropTypes.string,
    pipeline_preset: PropTypes.string,
  }),
  openCompId: PropTypes.string,
  setOpenCompId: PropTypes.func,
  openEvidenceCompId: PropTypes.string,
  setOpenEvidenceCompId: PropTypes.func,
  onAskAiComponent: PropTypes.func,
};
