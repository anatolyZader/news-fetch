import { useState } from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useLanguage } from '../context/LanguageContext.jsx';

const LANGS = ['en', 'he', 'ru'];

/** ISO-style codes, always Latin (locale-independent). */
const LANG_LABELS = { en: 'EN', he: 'HE', ru: 'RU' };

const MENU_ID = 'language-selector-menu';

export function LanguageSelector() {
  const { lang, setLang, t } = useLanguage();
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);

  return (
    <>
      <Button
        type="button"
        variant="outlined"
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={<KeyboardArrowDownIcon fontSize="small" />}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? MENU_ID : undefined}
        aria-label={`${t('settings.section.language')}: ${LANG_LABELS[lang]}`}
        sx={(theme) => ({
          minWidth: 0,
          paddingTop: theme.spacing(0.5),
          paddingBottom: theme.spacing(0.5),
          paddingLeft: theme.spacing(1),
          paddingRight: theme.spacing(0.5),
          fontSize: theme.typography.pill.fontSize,
          borderRadius: theme.custom.radius.sm,
          color: theme.palette.text.secondary,
          borderColor: theme.palette.divider,
          lineHeight: 1.2,
          '&:hover': {
            color: theme.palette.text.primary,
            borderColor: theme.palette.divider,
            background: 'transparent',
          },
        })}
      >
        {LANG_LABELS[lang]}
      </Button>
      <Menu
        id={MENU_ID}
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        slotProps={{ list: { 'aria-label': t('settings.section.language') } }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {LANGS.map((l) => (
          <MenuItem
            key={l}
            selected={lang === l}
            onClick={() => {
              setLang(l);
              setAnchor(null);
            }}
          >
            {LANG_LABELS[l]}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
