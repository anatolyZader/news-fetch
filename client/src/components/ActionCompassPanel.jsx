import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { authFetch } from '../lib/authFetch.js';
import { formatTemplate } from '../lib/i18nFormat.js';
import { StatusTag } from '../ui/index.js';

const LEVEL_VARIANT = {
  critical: 'critical',
  warning: 'alert',
  watch: 'moderate',
  info: 'neutral',
};

const KIND_LABEL_KEY = {
  corroborate: 'actionCompass.kind.corroborate',
  repair_sampling: 'actionCompass.kind.repairSampling',
  communicate: 'actionCompass.kind.communicate',
  investigate: 'actionCompass.kind.investigate',
  allocate: 'actionCompass.kind.allocate',
  monitor: 'actionCompass.kind.monitor',
  escalate: 'actionCompass.kind.escalate',
};

const BAND_VARIANT = {
  critical: 'critical',
  elevated: 'alert',
  watch: 'moderate',
  unknown: 'neutral',
};

function componentLabel(componentId, t) {
  if (!componentId) return '';
  return t(`comp.${componentId}`) ?? componentId.replaceAll('_', ' ');
}

/**
 * Per-action approval button with mandatory justification textarea.
 * On submit, POSTs to /api/report/action/approve with action_id + reasoning.
 */
function ApproveActionButton({ action, t }) {
  const { getIdToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [reasoning, setReasoning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState(null);

  const handleApprove = useCallback(async () => {
    if (!reasoning.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { res } = await authFetch('/api/report/action/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: action.action_id, reasoning }),
        getIdToken,
      });
      if (res.ok) {
        setApproved(true);
        setOpen(false);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err?.message ?? 'Network error');
    } finally {
      setSubmitting(false);
    }
  }, [action.action_id, reasoning, getIdToken]);

  if (!action.action_id) return null;
  if (approved) {
    return (
      <Typography variant="caption" color="success.main" sx={{ mt: 0.5, display: 'block' }}>
        {t('actionCompass.approved')}
      </Typography>
    );
  }

  return (
    <Box sx={{ mt: 0.75 }}>
      {open ? (
        <Stack spacing={0.75}>
          <TextField
            size="small"
            multiline
            minRows={2}
            maxRows={5}
            placeholder={t('actionCompass.approvalReasoning')}
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            inputProps={{ 'aria-label': t('actionCompass.approvalReasoning') }}
            sx={{ fontSize: '0.8rem' }}
          />
          {error && (
            <Typography variant="caption" color="error">{error}</Typography>
          )}
          <Stack direction="row" spacing={0.75}>
            <Button
              size="small"
              variant="contained"
              disabled={!reasoning.trim() || submitting}
              onClick={handleApprove}
              sx={{ fontSize: '0.7rem' }}
            >
              {submitting ? t('actionCompass.approving') : t('actionCompass.confirmApproval')}
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={() => { setOpen(false); setReasoning(''); }}
              sx={{ fontSize: '0.7rem' }}
            >
              {t('common.cancel')}
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Button
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}
          onClick={() => setOpen(true)}
        >
          {t('actionCompass.approveAction')}
        </Button>
      )}
    </Box>
  );
}

ApproveActionButton.propTypes = {
  action: PropTypes.shape({
    action_id: PropTypes.string,
    id: PropTypes.string,
  }).isRequired,
  t: PropTypes.func.isRequired,
};

/**
 * Ranked operator actions during abstention/uncertainty (no numeric scores).
 */
export function ActionCompassPanel({
  actionCompass,
  onJumpToComponent,
  defaultOpen = false,
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(defaultOpen);

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
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        sx={(theme) => ({
          px: 2,
          py: 1.5,
          borderBottom: open ? theme.custom.border.hairline : 'none',
          background: theme.palette.action.hover,
          cursor: 'pointer',
        })}
      >
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ flex: 1, minWidth: 0 }}
        >
          <Typography variant="subtitle2" component="h2" sx={{ lineHeight: 1.3 }}>
            {t('actionCompass.panelTitle')}
          </Typography>
          {band !== 'unknown' && (
            <StatusTag variant={BAND_VARIANT[band] ?? 'neutral'}>
              {t(`actionCompass.band.${band}`)}
            </StatusTag>
          )}
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {t('attention.itemCount').replace('{n}', String(actions.length))}
          </Typography>
          <IconButton
            size="small"
            aria-label={open ? t('actionCompass.collapse') : t('actionCompass.expand')}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Stack>
      </Stack>

      <Collapse in={open}>
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={(theme) => ({
            m: 0,
            px: 2,
            pt: 1.5,
            pb: 1,
            lineHeight: 1.45,
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            borderBottom: theme.custom.border.hairline,
          })}
        >
          {t('actionCompass.subtitle')}
        </Typography>
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
                <StatusTag variant={LEVEL_VARIANT[action.level] ?? 'neutral'}>
                  {t(`attention.level.${action.level ?? 'watch'}`)}
                </StatusTag>
                {action.kind && KIND_LABEL_KEY[action.kind] && (
                  <StatusTag variant="neutral">
                    {t(KIND_LABEL_KEY[action.kind])}
                  </StatusTag>
                )}
                {action.component_id && (
                  <Typography variant="caption" color="text.secondary">
                    {componentLabel(action.component_id, t)}
                  </Typography>
                )}
              </Stack>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {formatTemplate(t(action.title_key), action.detail_params ?? {})}
              </Typography>
              {(action.why_now_text || action.why_now_key) && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  <Box component="span" sx={{ fontWeight: 600 }}>{`${t('actionCompass.whyNowLabel')}: `}</Box>
                  {action.why_now_text
                    ? action.why_now_text
                    : formatTemplate(t(action.why_now_key), action.why_now_params ?? {})}
                </Typography>
              )}
              {action.suggested_next_step && (
                <Typography variant="caption" color="text.primary" display="block" sx={{ mt: 0.5 }}>
                  {action.suggested_next_step}
                </Typography>
              )}
              {(action.success_signal_text || action.success_signal_key) && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                  <Box component="span" sx={{ fontWeight: 600, fontStyle: 'normal' }}>{`${t('actionCompass.successLabel')}: `}</Box>
                  {action.success_signal_text
                    ? action.success_signal_text
                    : t(action.success_signal_key)}
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
              {action.action_id && (
                <ApproveActionButton action={action} t={t} />
              )}
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

ActionCompassPanel.propTypes = {
  actionCompass: PropTypes.shape({
    uncertainty_band: PropTypes.string,
    actions: PropTypes.arrayOf(PropTypes.object),
  }),
  onJumpToComponent: PropTypes.func,
  defaultOpen: PropTypes.bool,
};
