import Alert from '@mui/material/Alert';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useTranslationStatus } from '../hooks/useTranslationStatus.js';
import PropTypes from 'prop-types';

/**
 * Warns when UI language is localized but server translation is disabled.
 */
export function LocaleStatusBanner({ reportLocalizing = false }) {
  const { lang, t } = useLanguage();
  const { translationEnabled, ready } = useTranslationStatus();

  if (!ready) return null;

  if (lang !== 'en' && !translationEnabled) {
    return (
      <Alert severity="warning" sx={{ mb: 1 }}>
        {t('locale.translationDisabled')}
      </Alert>
    );
  }

  if (reportLocalizing) {
    return (
      <Alert severity="info" sx={{ mb: 1 }}>
        {t('locale.loadingTranslatedReport')}
      </Alert>
    );
  }

  return null;
}

LocaleStatusBanner.propTypes = {
  reportLocalizing: PropTypes.bool,
};
