import { useState } from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useLanguage } from '../context/LanguageContext.jsx';
import PropTypes from 'prop-types';

const LANGS = ['en', 'he', 'ru'];

/** ISO-style codes, always Latin (locale-independent). */
const LANG_LABELS = { en: 'EN', he: 'HE', ru: 'RU' };

const MENU_ID = 'language-selector-menu';

export const LanguageSelector = (props) => {
  const { appearance = 'outlined' } = props;
  const { lang, setLang, t } = useLanguage();
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);
  const ghost = appearance === 'ghost';

  return (
    <>
      <Button
        type="button"
        variant={ghost ? 'text' : 'outlined'}
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={ghost ? undefined : <KeyboardArrowDownIcon fontSize="small" />}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? MENU_ID : undefined}
        aria-label={`${t('settings.section.language')}: ${LANG_LABELS[lang]}`}
        sx={(theme) => ({
          minWidth: 0,
          minHeight: ghost ? undefined : theme.spacing(4.5),
          paddingTop: ghost ? theme.spacing(0.25) : theme.spacing(0.75),
          paddingBottom: ghost ? theme.spacing(0.25) : theme.spacing(0.75),
          paddingLeft: ghost ? theme.spacing(0.5) : theme.spacing(1.25),
          paddingRight: ghost ? theme.spacing(0.5) : theme.spacing(1.25),
          fontSize: ghost ? theme.typography.caption.fontSize : theme.typography.pill.fontSize,
          borderRadius: `${theme.custom.radius.section}px`,
          color: 'text.secondary',
          borderColor: ghost ? 'transparent' : theme.palette.divider,
          lineHeight: 1.2,
          '&:hover': {
            color: 'text.primary',
            borderColor: ghost ? 'transparent' : theme.palette.divider,
            background: theme.palette.action.hover,
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
};

LanguageSelector.propTypes = {
  appearance: PropTypes.oneOf(['outlined', 'ghost']),
};
