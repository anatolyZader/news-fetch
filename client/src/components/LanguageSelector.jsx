import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useLanguage } from '../context/LanguageContext.jsx';

const LANGS = ['en', 'he', 'ru'];

export function LanguageSelector() {
  const { lang, setLang, t } = useLanguage();

  return (
    <ToggleButtonGroup
      value={lang}
      exclusive
      size="small"
      onChange={(_, next) => {
        if (next) setLang(next);
      }}
    >
      {LANGS.map((l) => (
        <ToggleButton key={l} value={l}>
          {t(`lang.${l}`)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
