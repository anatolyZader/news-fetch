import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
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

function writeBool(key, value) {
  try {
    localStorage.setItem(key, value ? 'true' : 'false');
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

function mirrorMailingToLocalStorage(email, products) {
  writeString(LS_MAIL_EMAIL, email ?? '');
  for (const p of PRODUCT_DEFS) {
    writeBool(productStorageKey(p.storageSuffix), Boolean(products?.[p.id]));
  }
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
  const { t, lang } = useLanguage();
  const { user, authRequired, logout, apiReady, getIdToken } = useAuth();
  const [mailingEmail, setMailingEmail] = useState('');
  const [savedMailingEmail, setSavedMailingEmail] = useState('');
  const [mailingLanguage, setMailingLanguage] = useState(lang);
  const [products, setProducts] = useState(() => loadProductsFromStorage());
  const [mailServerEnabled, setMailServerEnabled] = useState(false);
  const [mailPrefsLoading, setMailPrefsLoading] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [mailFeedback, setMailFeedback] = useState(null);
  const accountEmail = user?.email ?? '';
  const canUseMailing = Boolean(user) || !authRequired;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setMailFeedback(null);
      try {
        const cfgR = await fetch('/api/mail/config');
        const cfg = await cfgR.json().catch(() => ({}));
        if (!cancelled) setMailServerEnabled(Boolean(cfg.enabled));
      } catch {
        if (!cancelled) setMailServerEnabled(false);
      }

      const canLoadServerPrefs = Boolean(user) || !authRequired;
      if (!canLoadServerPrefs || !apiReady) {
        if (!cancelled) {
            setSavedMailingEmail(readString(LS_MAIL_EMAIL));
            setMailingEmail('');
            setMailingLanguage(lang);
          setProducts(loadProductsFromStorage());
        }
        return;
      }

      setMailPrefsLoading(true);
      try {
        const headers = new Headers();
        const tok = await getIdToken();
        if (tok) headers.set('Authorization', `Bearer ${tok}`);
        const r = await fetch('/api/mail/preferences', { headers });
        if (!r.ok) {
          if (!cancelled) {
            setSavedMailingEmail(readString(LS_MAIL_EMAIL));
            setMailingEmail('');
            setMailingLanguage(lang);
            setProducts(loadProductsFromStorage());
          }
          return;
        }
        const data = await r.json();
        const localEmail = readString(LS_MAIL_EMAIL);
        const localProducts = loadProductsFromStorage();
        let email = typeof data.email === 'string' ? data.email : '';
        let digestLang = ['en', 'he', 'ru'].includes(data.language) ? data.language : lang;
        let pro = {
          report: Boolean(data.products?.report),
          naftali: Boolean(data.products?.naftali),
          education: Boolean(data.products?.education),
          platform: Boolean(data.products?.platform),
        };

        if (!email && localEmail.trim() && tok) {
          const putR = await fetch('/api/mail/preferences', {
            method: 'PUT',
            headers: new Headers({
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tok}`,
            }),
            body: JSON.stringify({ email: localEmail.trim(), language: digestLang, products: localProducts }),
          });
          if (putR.ok) {
            const migrated = await putR.json();
            email = migrated.email ?? localEmail.trim();
            digestLang = ['en', 'he', 'ru'].includes(migrated.language) ? migrated.language : digestLang;
            pro = {
              report: Boolean(migrated.products?.report),
              naftali: Boolean(migrated.products?.naftali),
              education: Boolean(migrated.products?.education),
              platform: Boolean(migrated.products?.platform),
            };
          }
        }

        if (!cancelled) {
          setSavedMailingEmail(email);
          setMailingEmail('');
          setMailingLanguage(digestLang);
          setProducts(pro);
          mirrorMailingToLocalStorage(email, pro);
        }
      } finally {
        if (!cancelled) setMailPrefsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, user, authRequired, apiReady, getIdToken, lang]);

  const onMailingEmailChange = useCallback((e) => {
    setMailingEmail(e.target.value);
  }, []);

  const toggleProduct = useCallback((id) => {
    setProducts((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const saveMailingPreferences = useCallback(async () => {
    if (!canUseMailing) return;
    const nextEmail = mailingEmail.trim();
    const tok = await getIdToken();
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (tok) headers.set('Authorization', `Bearer ${tok}`);
    const body = { products, language: mailingLanguage };
    if (nextEmail) {
      body.email = nextEmail;
    } else if (!savedMailingEmail && accountEmail) {
      body.email = accountEmail;
    }

    const r = await fetch('/api/mail/preferences', {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
    const savedEmail = typeof data.email === 'string' ? data.email : (nextEmail || savedMailingEmail);
    const savedLanguage = ['en', 'he', 'ru'].includes(data.language) ? data.language : mailingLanguage;
    const savedProducts = data.products && typeof data.products === 'object' ? data.products : products;
    setSavedMailingEmail(savedEmail);
    setMailingEmail('');
    setMailingLanguage(savedLanguage);
    setProducts({
      report: Boolean(savedProducts.report),
      naftali: Boolean(savedProducts.naftali),
      education: Boolean(savedProducts.education),
      platform: Boolean(savedProducts.platform),
    });
    mirrorMailingToLocalStorage(savedEmail, savedProducts);
    return { email: savedEmail, language: savedLanguage, products: savedProducts };
  }, [accountEmail, canUseMailing, getIdToken, mailingEmail, mailingLanguage, products, savedMailingEmail]);

  const handleSaveMailing = useCallback(async () => {
    if (!canUseMailing) return;
    setSaveBusy(true);
    setMailFeedback(null);
    try {
      await saveMailingPreferences();
      setMailFeedback({ severity: 'success', message: t('settings.mailingSaveOk') });
    } catch (e) {
      setMailFeedback({ severity: 'error', message: e?.message ?? t('settings.mailingSaveError') });
    } finally {
      setSaveBusy(false);
    }
  }, [canUseMailing, saveMailingPreferences, t]);

  const handleSendDigest = useCallback(async () => {
    if (!canUseMailing) return;
    setSendBusy(true);
    setMailFeedback(null);
    try {
      if (mailingEmail.trim()) {
        await saveMailingPreferences();
      }
      const tok = await getIdToken();
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (tok) headers.set('Authorization', `Bearer ${tok}`);
      const r = await fetch('/api/mail/send-digest', {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const errBody = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(errBody.error ?? `HTTP ${r.status}`);
      setMailFeedback({ severity: 'success', message: t('settings.mailingSendOk') });
    } catch (e) {
      setMailFeedback({ severity: 'error', message: e?.message ?? t('settings.mailingSendError') });
    } finally {
      setSendBusy(false);
    }
  }, [canUseMailing, getIdToken, mailingEmail, saveMailingPreferences, t]);

  const showLocalOnlyNote = !mailServerEnabled;
  const mailingActionsDisabled = !canUseMailing || mailPrefsLoading || saveBusy || sendBusy;

  return (
    <ModalPanel
      open={open}
      onClose={onClose}
      title={t('settings.title')}
      ariaLabel={t('settings.title')}
      initialWidth={560}
      initialHeight={720}
      zIndex={64}
      showCloseButton
      closeLabel={t('app.close')}
      modeless
      minimizeOnOutsideClick
      disableBackdropClose
    >
      <Stack spacing={2.5} sx={{ padding: '1rem 1.1rem 1.25rem' }}>
        {showLocalOnlyNote && (
          <Alert severity="info" variant="outlined" sx={{ alignItems: 'flex-start' }}>
            {t('settings.localOnly')}
          </Alert>
        )}

        <Section title={t('settings.section.general')}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
            {t('settings.generalBody')}
          </Typography>
        </Section>

        <Divider />

        <Section title={t('settings.section.language')}>
          <Box component="span" sx={{ marginInlineStart: 2 }}>
            <LanguageSelector />
          </Box>
        </Section>

        <Divider />

        <Section title={t('settings.section.mailing')}>
          <Typography variant="body2" color="text.secondary" sx={{ marginBottom: 1.5, lineHeight: 1.55 }}>
            {t('settings.mailingIntro')}
          </Typography>

          {!mailServerEnabled && (
            <Alert severity="warning" variant="outlined" sx={{ marginBottom: 1.5 }}>
              {t('settings.mailingNotConfigured')}
            </Alert>
          )}

          {!canUseMailing && (
            <Alert severity="info" variant="outlined" sx={{ marginBottom: 1.5 }}>
              {t('settings.mailingNeedSignIn')}
            </Alert>
          )}

          {mailFeedback && (
            <Alert severity={mailFeedback.severity} variant="outlined" sx={{ marginBottom: 1.5 }}>
              {mailFeedback.message}
            </Alert>
          )}

          <TextField
            size="small"
            fullWidth
            type="email"
            autoComplete="email"
            label={t('settings.mailingDestinationEmail')}
            value={mailingEmail}
            onChange={onMailingEmailChange}
            placeholder={savedMailingEmail || accountEmail || t('settings.mailingEmailPlaceholder')}
            helperText={t('settings.mailingDestinationHelp').replace('{accountEmail}', accountEmail || '—')}
            disabled={!canUseMailing || mailPrefsLoading}
            sx={{ marginBottom: 1 }}
          />

          {(savedMailingEmail || accountEmail) && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginBottom: 2 }}>
              {t('settings.mailingSavedDestination')
                .replace('{email}', savedMailingEmail || accountEmail)}
            </Typography>
          )}

          <TextField
            select
            size="small"
            fullWidth
            label={t('settings.mailingLanguage')}
            value={mailingLanguage}
            onChange={(e) => setMailingLanguage(e.target.value)}
            helperText={t('settings.mailingLanguageHelp')}
            disabled={!canUseMailing || mailPrefsLoading}
            sx={{ marginBottom: 2 }}
          >
            {['en', 'he', 'ru'].map((l) => (
              <MenuItem key={l} value={l}>
                {t(`settings.mailingLanguage.${l}`)}
              </MenuItem>
            ))}
          </TextField>

          <Stack direction="row" spacing={1} sx={{ marginBottom: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="small"
              disabled={mailingActionsDisabled || !mailServerEnabled}
              onClick={() => void handleSaveMailing()}
            >
              {saveBusy ? t('settings.mailingSaving') : t('settings.mailingSave')}
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={mailingActionsDisabled || !mailServerEnabled}
              onClick={() => void handleSendDigest()}
            >
              {sendBusy ? t('settings.mailingSending') : t('settings.mailingSendNow')}
            </Button>
          </Stack>

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
                    disabled={!canUseMailing || mailPrefsLoading}
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
