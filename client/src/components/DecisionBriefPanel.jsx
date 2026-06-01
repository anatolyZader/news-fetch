import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { StatusTag } from '../ui/index.js';

const LEVEL_VARIANT = {
  critical: 'critical',
  warning: 'alert',
  watch: 'moderate',
  info: 'neutral',
};

/**
 * Batch agent decision brief (operator-safe; no 1–10 scores).
 */
export function DecisionBriefPanel({ decisionBrief }) {
  const { t } = useLanguage();

  if (!decisionBrief?.summary && (decisionBrief?.priority_items?.length ?? 0) <= 0) {
    return null;
  }

  const items = decisionBrief.priority_items ?? [];

  return (
    <Box
      component="section"
      aria-label={t('decisionBrief.panelTitle')}
      sx={(theme) => ({
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        overflow: 'hidden',
        background: theme.palette.background.paper,
        boxShadow: theme.custom.elevation.subtle,
      })}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: (theme) => theme.custom.border.hairline }}>
        <Typography variant="subtitle2" component="h2">
          {t('decisionBrief.panelTitle')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('decisionBrief.subtitle')}
        </Typography>
      </Box>

      <Stack spacing={2} sx={{ p: 2 }}>
        {decisionBrief.summary && (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {decisionBrief.summary}
          </Typography>
        )}

        {items.length > 0 && (
          <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {items.map((item, idx) => {
              const key = item.attention_id ?? item.recommendation_id ?? `brief-${idx}`;
              return (
                <Box
                  component="li"
                  key={key}
                  sx={(theme) => ({
                    border: theme.custom.border.hairline,
                    borderRadius: `${theme.custom.radius.chip}px`,
                    p: 1.5,
                  })}
                >
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                    <StatusTag
                      variant={LEVEL_VARIANT[item.level] ?? 'neutral'}
                      label={t(`attention.level.${item.level ?? 'watch'}`)}
                    />
                  </Stack>
                  {item.rationale && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      {item.rationale}
                    </Typography>
                  )}
                  {item.suggested_next_step && (
                    <Typography variant="body2">
                      <strong>{t('decisionBrief.nextStep')}:</strong>
                      {' '}
                      {item.suggested_next_step}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

DecisionBriefPanel.propTypes = {
  decisionBrief: PropTypes.shape({
    summary: PropTypes.string,
    priority_items: PropTypes.arrayOf(PropTypes.shape({
      attention_id: PropTypes.string,
      recommendation_id: PropTypes.string,
      level: PropTypes.string,
      rationale: PropTypes.string,
      suggested_next_step: PropTypes.string,
    })),
    generated_at: PropTypes.string,
    source: PropTypes.string,
  }),
};
