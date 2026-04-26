import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LanguageSelector } from './LanguageSelector.jsx';
import { ModalPanel } from '../ui/ModalPanel.jsx';

const LS_MAIL_EMAIL = 'vibes-witch:settings:mailingEmail';

const PRODUCT_DEFS = [
  { id: 'report', storageSuffix: 'report', defaultValue: true },
  { id: 'naftali', storageSuffix: 'naftali', defaultValue: true },
  { id: 'education', storageSuffix: 'education', defaultValue: true },
  { id: 'platform', storageSuffix: 'platform', defaultValue: false },
];

function productStorageKey(suffix) {
  return `vibes-witch:settings:mail:product:${suffix}`;
}

function readBool(key, defaultValue) {
  if (typeof localStorage === 'undefined') return defaultValue;
  try {
    const v = localStorage.getItem(key);
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch {
    /* ignore */
  }
  return defaultValue;
}

function writeBool(key, value) {
  try {
    localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

function readString(key) {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeString(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function loadProductsFromStorage() {
  const out = {};
  for (const p of PRODUCT_DEFS) {
    out[p.id] = readBool(productStorageKey(p.storageSuffix), p.defaultValue);
  }
  return out;
}

function Section({ title, children }) {
  return (
    <Box component="section" aria-label={title}>
      <Typography variant="panelTitle" color="text.secondary" sx={{ marginBottom: 1.25 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export function SettingsPanel({ open, onClose, onOpenDocs }) {
  const { t } = useLanguage();
  const { user, authRequired, logout } = useAuth();
  const [mailingEmail, setMailingEmail] = useState('');
  const [products, setProducts] = useState(() => loadProductsFromStorage());

  useEffect(() => {
    if (!open) return;
    setMailingEmail(readString(LS_MAIL_EMAIL));
    setProducts(loadProductsFromStorage());
  }, [open]);

  const onMailingEmailChange = useCallback((e) => {
    const v = e.target.value;
    setMailingEmail(v);
    writeString(LS_MAIL_EMAIL, v);
  }, []);

  const toggleProduct = useCallback((id) => {
    const def = PRODUCT_DEFS.find((p) => p.id === id);
    if (!def) return;
    setProducts((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      writeBool(productStorageKey(def.storageSuffix), next[id]);
      return next;
    });
  }, []);

  const accountEmail = user?.email ?? '';

  return (
    <ModalPanel
      open={open}
      onClose={onClose}
      title={t('settings.title')}
      ariaLabel={t('settings.title')}
      initialWidth={560}
      initialHeight={720}
      zIndex={64}
    >
      <Stack spacing={2.5} sx={{ padding: '1rem 1.1rem 1.25rem' }}>
        <Alert severity="info" variant="outlined" sx={{ alignItems: 'flex-start' }}>
          {t('settings.localOnly')}
        </Alert>

        <Section title={t('settings.section.general')}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
            {t('settings.generalBody')}
          </Typography>
        </Section>

        <Divider />

        <Section title={t('settings.section.language')}>
          <LanguageSelector />
        </Section>

        <Divider />

        <Section title={t('settings.section.mailing')}>
          <Typography variant="body2" color="text.secondary" sx={{ marginBottom: 1.5, lineHeight: 1.55 }}>
            {t('settings.mailingIntro')}
          </Typography>

          <TextField
            size="small"
            fullWidth
            type="email"
            autoComplete="email"
            label={t('settings.mailingDestinationEmail')}
            value={mailingEmail}
            onChange={onMailingEmailChange}
            placeholder={accountEmail || t('settings.mailingEmailPlaceholder')}
            helperText={t('settings.mailingDestinationHelp').replace('{accountEmail}', accountEmail || '—')}
            sx={{ marginBottom: 2 }}
          />

          <Typography variant="body2" color="text.secondary" sx={{ marginBottom: 1, fontWeight: 600 }}>
            {t('settings.mailingProductsHeading')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginBottom: 1.5 }}>
            {t('settings.mailingProductsSub')}
          </Typography>

          <FormGroup>
            {PRODUCT_DEFS.map((p) => (
              <FormControlLabel
                key={p.id}
                control={(
                  <Checkbox
                    checked={Boolean(products[p.id])}
                    onChange={() => toggleProduct(p.id)}
                    inputProps={{ 'aria-label': t(`settings.mailProduct.${p.id}`) }}
                  />
                )}
                label={t(`settings.mailProduct.${p.id}`)}
              />
            ))}
          </FormGroup>
        </Section>

        <Divider />

        <Section title={t('settings.section.account')}>
          {authRequired ? (
            <Stack spacing={1}>
              {accountEmail && (
                <Typography variant="body2">
                  {t('settings.signedInAs')}{' '}
                  <Box component="span" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
                    {accountEmail}
                  </Box>
                </Typography>
              )}
              <Button variant="outlined" size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => void logout()}>
                {t('settings.signOut')}
              </Button>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {t('settings.accountAnonymous')}
            </Typography>
          )}
        </Section>

        <Divider />

        <Section title={t('settings.section.privacy')}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55, marginBottom: 1 }}>
            {t('settings.privacyBody')}
          </Typography>
          {onOpenDocs && (
            <Link
              component="button"
              type="button"
              variant="body2"
              onClick={onOpenDocs}
              sx={{ cursor: 'pointer' }}
            >
              {t('settings.openDocs')}
            </Link>
          )}
        </Section>
      </Stack>
    </ModalPanel>
  );
}
