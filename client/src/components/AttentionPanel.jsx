import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { StatusTag } from '../ui/index.js';

const LEVEL_VARIANT = {
  critical: 'critical',
  warning: 'alert',
  watch: 'moderate',
  info: 'neutral',
};

const LEVEL_LABEL_KEY = {
  critical: 'attention.level.critical',
  warning: 'attention.level.warning',
  watch: 'attention.level.watch',
  info: 'attention.level.info',
};

const DRIFT_CODE_MAP = {
  high_mean_polarization: {
    level: 'warning',
    title_key: 'attention.drift.highPolarization',
    detail_key: 'attention.drift.highPolarizationDetail',
  },
  long_term_degradation_warning: {
    level: 'warning',
    title_key: 'attention.drift.chronicDegradation',
    detail_key: 'attention.drift.chronicDegradationDetail',
  },
  erosion_elevated: {
    level: 'watch',
    title_key: 'attention.drift.erosionElevated',
    detail_key: 'attention.drift.erosionElevatedDetail',
  },
};

function formatTemplate(template, params = {}) {
  if (!template) return '';
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, value == null ? '—' : String(value)),
    template,
  );
}

function componentLabel(componentId, t) {
  if (!componentId) return '';
  return t(`comp.${componentId}`) ?? componentId.replaceAll('_', ' ');
}

/**
 * @param {Array<object>} items
 * @param {Array<object>|null|undefined} driftAlerts
 * @param {boolean} isAnalyst
 */
export function mergeAttentionItems(items, driftAlerts, isAnalyst) {
  const merged = [...(items ?? [])];
  const seen = new Set(merged.map((i) => i.id));

  if (!isAnalyst || !Array.isArray(driftAlerts)) return merged;

  for (const alert of driftAlerts) {
    const mapping = DRIFT_CODE_MAP[alert.code];
    if (!mapping) continue;
    const id = `drift:${alert.code}:${alert.component_id ?? 'scope'}`;
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({
      id,
      level: mapping.level,
      code: alert.code,
      title_key: mapping.title_key,
      detail_key: mapping.detail_key,
      detail_params: {
        component_id: alert.component_id ?? null,
        message: alert.message ?? '',
      },
      component_id: alert.component_id ?? undefined,
      suggested_action_key: alert.component_id
        ? 'attention.suggested.reviewComponent'
        : 'attention.suggested.reviewTrend',
    });
  }

  const order = { critical: 0, warning: 1, watch: 2, info: 3 };
  merged.sort((a, b) => {
    const la = order[a.level] ?? 99;
    const lb = order[b.level] ?? 99;
    if (la !== lb) return la - lb;
    return String(a.id).localeCompare(String(b.id));
  });

  return merged;
}

function highestLevel(items) {
  const order = ['critical', 'warning', 'watch', 'info'];
  for (const level of order) {
    if (items.some((i) => i.level === level)) return level;
  }
  return null;
}

export function AttentionPanel({
  items = [],
  driftAlerts = null,
  displayTier = 'operator',
  onJumpToComponent,
  onScrollToValidationReview,
}) {
  const { t } = useLanguage();
  const isAnalyst = displayTier === 'analyst';
  const allItems = mergeAttentionItems(items, driftAlerts, isAnalyst);

  if (allItems.length === 0) return null;

  const peak = highestLevel(allItems);

  return (
    <Box
      component="section"
      aria-label={t('attention.panelTitle')}
      sx={(theme) => ({
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        overflow: 'hidden',
        background: theme.palette.background.paper,
        boxShadow: theme.custom.elevation.subtle,
      })}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={(theme) => ({
          paddingTop: theme.spacing(1.25),
          paddingBottom: theme.spacing(1.25),
          paddingLeft: theme.spacing(1.5),
          paddingRight: theme.spacing(1.5),
          borderBottom: theme.custom.border.hairline,
          background: theme.palette.action.hover,
        })}
      >
        <Typography variant="cardTitle">{t('attention.panelTitle')}</Typography>
        <Stack direction="row" spacing={0.75} alignItems="center">
          {peak && (
            <StatusTag variant={LEVEL_VARIANT[peak] ?? 'neutral'}>
              {t(LEVEL_LABEL_KEY[peak])}
            </StatusTag>
          )}
          <Typography variant="caption" color="text.secondary">
            {t('attention.itemCount').replace('{n}', String(allItems.length))}
          </Typography>
        </Stack>
      </Stack>

      <Stack spacing={0} divider={null}>
        {allItems.map((entry) => {
          const title = t(entry.title_key);
          const detailParams = { ...(entry.detail_params ?? {}) };
          if (entry.component_id && detailParams.component_id) {
            detailParams.component_label = componentLabel(entry.component_id, t);
          }
          const detail = entry.detail_key
            ? formatTemplate(t(entry.detail_key), detailParams)
            : '';
          const actionKey = entry.suggested_action_key;

          return (
            <Box
              key={entry.id}
              sx={(theme) => ({
                paddingTop: theme.spacing(1.25),
                paddingBottom: theme.spacing(1.25),
                paddingLeft: theme.spacing(1.5),
                paddingRight: theme.spacing(1.5),
                borderBottom: theme.custom.border.hairline,
                '&:last-child': { borderBottom: 'none' },
              })}
            >
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <StatusTag variant={LEVEL_VARIANT[entry.level] ?? 'neutral'}>
                  {t(LEVEL_LABEL_KEY[entry.level] ?? 'attention.level.info')}
                </StatusTag>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {title}
                  </Typography>
                  {detail && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginTop: 0.25 }}>
                      {detail}
                    </Typography>
                  )}
                  {entry.component_id && onJumpToComponent && actionKey && (
                    <Link
                      component="button"
                      type="button"
                      variant="caption"
                      onClick={() => onJumpToComponent(entry.component_id)}
                      sx={{ marginTop: 0.5, display: 'inline-block' }}
                    >
                      {t(actionKey).replace('{component}', componentLabel(entry.component_id, t))}
                    </Link>
                  )}
                  {!entry.component_id && actionKey === 'attention.suggested.reviewTrend' && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginTop: 0.5 }}>
                      {t(actionKey)}
                    </Typography>
                  )}
                  {actionKey === 'attention.suggested.reviewExtraction' && onScrollToValidationReview && (
                    <Link
                      component="button"
                      type="button"
                      variant="caption"
                      onClick={onScrollToValidationReview}
                      sx={{ marginTop: 0.5, display: 'inline-block' }}
                    >
                      {t(actionKey)}
                    </Link>
                  )}
                </Box>
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

AttentionPanel.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object),
  driftAlerts: PropTypes.arrayOf(PropTypes.object),
  displayTier: PropTypes.oneOf(['operator', 'analyst']),
  onJumpToComponent: PropTypes.func,
  onScrollToValidationReview: PropTypes.func,
};
