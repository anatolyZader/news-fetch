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

const BAND_VARIANT = {
  critical: 'critical',
  elevated: 'alert',
  watch: 'moderate',
  unknown: 'neutral',
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
 * Ranked operator actions during abstention/uncertainty (no numeric scores).
 */
export function ActionCompassPanel({
  actionCompass,
  onJumpToComponent,
}) {
  const { t } = useLanguage();

  if (!actionCompass?.actions?.length && actionCompass?.uncertainty_band === 'unknown') {
    return null;
  }
  if (!actionCompass) return null;

  const { uncertainty_band: band, actions = [] } = actionCompass;
  if (!actions.length && band === 'unknown') return null;

  return (
    <Box
      component="section"
      aria-label={t('actionCompass.panelTitle')}
      sx={(theme) => ({
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        overflow: 'hidden',
        background: theme.palette.background.paper,
        boxShadow: theme.custom.elevation.subtle,
      })}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: (theme) => theme.custom.border.hairline }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2" component="h2">
            {t('actionCompass.panelTitle')}
          </Typography>
          {band !== 'unknown' && (
            <StatusTag variant={BAND_VARIANT[band] ?? 'neutral'}>
              {t(`actionCompass.band.${band}`)}
            </StatusTag>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {t('actionCompass.subtitle')}
        </Typography>
      </Box>

      <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', m: 0, p: 2 }}>
        {actions.map((action) => (
          <Box
            component="li"
            key={action.id}
            sx={(theme) => ({
              border: theme.custom.border.hairline,
              borderRadius: `${theme.custom.radius.chip}px`,
              p: 1.5,
            })}
          >
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
              <StatusTag
                variant={LEVEL_VARIANT[action.level] ?? 'neutral'}
                label={t(`attention.level.${action.level ?? 'watch'}`)}
              />
              {action.component_id && (
                <Typography variant="caption" color="text.secondary">
                  {componentLabel(action.component_id, t)}
                </Typography>
              )}
            </Stack>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {formatTemplate(t(action.title_key), action.detail_params ?? {})}
            </Typography>
            {action.detail_key && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {formatTemplate(t(action.detail_key), action.detail_params ?? {})}
              </Typography>
            )}
            {action.suggested_next_step && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {action.suggested_next_step}
              </Typography>
            )}
            {action.suggested_action_key && action.component_id && onJumpToComponent && (
              <Link
                component="button"
                variant="caption"
                sx={{ mt: 0.5, display: 'inline-block' }}
                onClick={() => onJumpToComponent(action.component_id)}
              >
                {t(action.suggested_action_key)}
              </Link>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

ActionCompassPanel.propTypes = {
  actionCompass: PropTypes.shape({
    uncertainty_band: PropTypes.string,
    actions: PropTypes.arrayOf(PropTypes.object),
  }),
  onJumpToComponent: PropTypes.func,
};
