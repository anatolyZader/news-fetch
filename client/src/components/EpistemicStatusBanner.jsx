import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { deriveEpistemicBannerMessages } from '../lib/epistemicBannerMessages.js';

function formatTemplate(template, params = {}) {
  if (!template) return '';
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, value == null ? '—' : String(value)),
    template,
  );
}

export function EpistemicStatusBanner({ assessment, displayTier, attentionItems, suggestCrisisBudget }) {
  const { t } = useLanguage();
  const attentionItemIds = (attentionItems ?? []).map((item) => item.id).filter(Boolean);
  const messages = deriveEpistemicBannerMessages(assessment, {
    displayTier,
    attentionItemIds,
    suggestCrisisBudget,
  });

  if (messages.length === 0) return null;

  return (
    <Stack spacing={1}>
      {messages.map((msg) => (
        <Alert key={msg.id} severity={msg.severity} variant="outlined">
          {formatTemplate(t(msg.messageKey), msg.params)}
        </Alert>
      ))}
    </Stack>
  );
}

EpistemicStatusBanner.propTypes = {
  assessment: PropTypes.object,
  displayTier: PropTypes.oneOf(['operator', 'analyst']),
  attentionItems: PropTypes.arrayOf(PropTypes.object),
  suggestCrisisBudget: PropTypes.bool,
};
