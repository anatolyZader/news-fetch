import { forwardRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { useValidationReviewQueue } from '../hooks/useValidationReviewQueue.js';
import { StatusTag } from '../ui/index.js';

export const ValidationReviewPanel = forwardRef(function ValidationReviewPanel(
  { reportDate, reportScope, enabled },
  ref,
) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(true);
  const { items, loading, error, savingKey, submitDecision } = useValidationReviewQueue(
    reportDate,
    reportScope,
    { enabled },
  );

  if (!enabled) return null;

  return (
    <Box
      ref={ref}
      component="section"
      aria-label={t('validationReview.panelTitle')}
      sx={(theme) => ({
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        overflow: 'hidden',
        background: theme.palette.background.paper,
      })}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={(theme) => ({
          padding: theme.spacing(1.25, 1.5),
          borderBottom: open ? theme.custom.border.hairline : 'none',
          background: theme.palette.action.hover,
          cursor: 'pointer',
        })}
        onClick={() => setOpen((v) => !v)}
      >
        <Typography variant="cardTitle" sx={{ flex: 1 }}>
          {t('validationReview.panelTitle')}
        </Typography>
        <StatusTag variant="neutral">
          {loading ? '…' : String(items.length)}
        </StatusTag>
        <IconButton
          size="small"
          aria-expanded={open}
          sx={{ transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Collapse in={open}>
        <Box sx={(theme) => ({ padding: theme.spacing(1.5) })}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginBottom: 1 }}>
            {t('validationReview.analystOnly')}
          </Typography>

          {error && (
            <Alert severity="error" variant="outlined" sx={{ marginBottom: 1 }}>
              {error}
            </Alert>
          )}

          {!loading && items.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {t('validationReview.empty')}
            </Typography>
          )}

          <Stack spacing={1.5}>
            {items.map((item) => {
              const isEpistemic = String(item.article_key ?? '').startsWith('__epistemic__:');
              return (
              <Box
                key={item.article_key}
                sx={(theme) => ({
                  border: theme.custom.border.hairline,
                  borderRadius: `${theme.custom.radius.section}px`,
                  padding: theme.spacing(1.25),
                })}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {isEpistemic
                    ? t('validationReview.epistemic.title')
                    : `#${item.queue_rank} — ${item.article_source ?? item.article_key}`}
                </Typography>
                {(item.reasons ?? []).slice(0, 3).map((r, idx) => (
                  <StatusTag key={`${item.article_key}-r-${idx}`} variant="neutral">
                    {r.code}
                  </StatusTag>
                ))}
                {!isEpistemic && (item.signals ?? []).slice(0, 1).map((s, idx) => (
                  <Typography
                    key={`${item.article_key}-s-${idx}`}
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', marginTop: 0.5 }}
                  >
                    {String(s.evidence ?? '').slice(0, 200)}
                  </Typography>
                ))}
                {isEpistemic && item.article_key === '__epistemic__:social_channel_quarantine' && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginTop: 0.5 }}>
                    {t('validationReview.epistemic.socialQuarantineDetail')}
                  </Typography>
                )}
                <Stack direction="row" spacing={0.75} sx={{ marginTop: 1, flexWrap: 'wrap' }}>
                  {isEpistemic && item.article_key === '__epistemic__:social_channel_quarantine' ? (
                    <>
                      <Button
                        size="small"
                        variant="contained"
                        color="warning"
                        disabled={savingKey === item.article_key}
                        onClick={() => submitDecision(item.article_key, 'confirm_social_quarantine', {})}
                      >
                        {t('validationReview.action.confirmSocialQuarantine')}
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        disabled={savingKey === item.article_key}
                        onClick={() => submitDecision(item.article_key, 'dismiss_social_quarantine', {})}
                      >
                        {t('validationReview.action.dismissSocialQuarantine')}
                      </Button>
                    </>
                  ) : (
                    <>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={savingKey === item.article_key}
                    onClick={() => submitDecision(item.article_key, 'label', { note: '' })}
                  >
                    {t('validationReview.action.label')}
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    disabled={savingKey === item.article_key}
                    onClick={() => submitDecision(item.article_key, 'skip')}
                  >
                    {t('validationReview.action.skip')}
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    disabled={savingKey === item.article_key}
                    onClick={() => submitDecision(item.article_key, 'defer')}
                  >
                    {t('validationReview.action.defer')}
                  </Button>
                    </>
                  )}
                </Stack>
              </Box>
            );
            })}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
});

ValidationReviewPanel.propTypes = {
  reportDate: PropTypes.string,
  reportScope: PropTypes.string,
  enabled: PropTypes.bool,
};
