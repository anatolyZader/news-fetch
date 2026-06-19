import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { deriveEpistemicBannerMessages } from '../lib/epistemicBannerMessages.js';
import { formatTemplate } from '../lib/i18nFormat.js';

export function EpistemicStatusBanner({ assessment, displayView, attentionItems, suggestCrisisBudget, generatedAt }) {
  const { t } = useLanguage();
  const attentionItemIds = (attentionItems ?? []).map((item) => item.id).filter(Boolean);
  const messages = deriveEpistemicBannerMessages(assessment, {
    displayView,
    attentionItemIds,
    suggestCrisisBudget,
    generatedAt: generatedAt ?? null,
  });

  if (messages.length === 0) return null;

  return (
    <Stack spacing={1}>
      {messages.map((msg) => {
        const isError = msg.severity === 'error';
        return isError ? (
          <Alert
            key={msg.id}
            severity="error"
            variant="filled"
            sx={{
              width: '100%',
              borderRadius: 0,
              fontWeight: 600,
              animation: 'epistemicPulse 2s ease-in-out infinite',
              '@keyframes epistemicPulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.75 },
              },
              '& .MuiAlert-message': {
                minWidth: 0,
                overflow: 'visible',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              },
            }}
          >
            {formatTemplate(t(msg.messageKey), msg.params)}
          </Alert>
        ) : (
          <Alert
            key={msg.id}
            severity={msg.severity}
            variant="outlined"
            sx={{
              minWidth: 0,
              '& .MuiAlert-message': {
                minWidth: 0,
                overflow: 'visible',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              },
            }}
          >
            {formatTemplate(t(msg.messageKey), msg.params)}
          </Alert>
        );
      })}
    </Stack>
  );
}

EpistemicStatusBanner.propTypes = {
  assessment: PropTypes.object,
  displayView: PropTypes.oneOf(['operator', 'analyst']),
  attentionItems: PropTypes.arrayOf(PropTypes.object),
  suggestCrisisBudget: PropTypes.bool,
  generatedAt: PropTypes.string,
};
