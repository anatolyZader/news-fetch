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
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LanguageSelector } from './LanguageSelector.jsx';
import { buildDigestRecipientRows } from '../lib/digestRecipientRows.js';
import { ModalPanel } from '../ui/ModalPanel.jsx';
import { PanelWindowShell } from '../ui/PanelWindowShell.jsx';
import PropTypes from 'prop-types';

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

function mirrorLocalMailingFallback(lang) {
  return {
    savedMailingEmail: readString(LS_MAIL_EMAIL),
    mailingEmail: '',
    mailingLanguage: lang,
    products: loadProductsFromStorage(),
  };
}

function parseProductsFromApi(data) {
  return {
    report: Boolean(data.products?.report),
    naftali: Boolean(data.products?.naftali),
    education: Boolean(data.products?.education),
    platform: Boolean(data.products?.platform),
  };
}

async function loadMailingPreferences({ user, authRequired, apiReady, getIdToken, lang }) {
  // The token is sent to /api/mail/config too: the endpoint stays reachable
  // anonymously, but only computes canManageRecipients when a user is attached.
  const tok = await getIdToken().catch(() => null);

  let mailServerEnabled;
  let canManageRecipients = false;
  try {
    const cfgHeaders = new Headers();
    if (tok) cfgHeaders.set('Authorization', `Bearer ${tok}`);
    const cfgR = await fetch('/api/mail/config', { headers: cfgHeaders });
    const cfg = await cfgR.json().catch(() => ({}));
    mailServerEnabled = Boolean(cfg.enabled);
    canManageRecipients = Boolean(cfg.canManageRecipients);
  } catch {
    mailServerEnabled = false;
  }

  const canLoadServerPrefs = Boolean(user) || !authRequired;
  if (!canLoadServerPrefs || !apiReady) {
    return { mailServerEnabled, canManageRecipients, ...mirrorLocalMailingFallback(lang) };
  }

  const headers = new Headers();
  if (tok) headers.set('Authorization', `Bearer ${tok}`);
  const r = await fetch('/api/mail/preferences', { headers });
  if (!r.ok) {
    return { mailServerEnabled, canManageRecipients, ...mirrorLocalMailingFallback(lang) };
  }

  const data = await r.json();
  const localEmail = readString(LS_MAIL_EMAIL);
  const localProducts = loadProductsFromStorage();
  let email = typeof data.email === 'string' ? data.email : '';
  let digestLang = ['en', 'he', 'ru'].includes(data.language) ? data.language : lang;
  let pro = parseProductsFromApi(data);

  // Same reason as in saveMailingPreferences: for a mailing admin an empty
  // server-side email is the intended end state, not a gap to backfill from
  // localStorage. Their address is on the shared list instead.
  if (!canManageRecipients && !email && localEmail.trim() && tok) {
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
      pro = parseProductsFromApi(migrated);
    }
  }

  mirrorMailingToLocalStorage(email, pro);
  return {
    mailServerEnabled,
    canManageRecipients,
    savedMailingEmail: email,
    mailingEmail: '',
    mailingLanguage: digestLang,
    products: pro,
  };
}

/** Shared distribution list; maintainer-only, so a 403 simply means "no list to show". */
async function fetchRecipients(getIdToken) {
  const headers = new Headers();
  const tok = await getIdToken();
  if (tok) headers.set('Authorization', `Bearer ${tok}`);
  const r = await fetch('/api/mail/recipients', { headers });
  if (!r.ok) return [];
  const data = await r.json().catch(() => ({}));
  return Array.isArray(data.recipients) ? data.recipients : [];
}

async function mutateRecipients(getIdToken, { method, email }) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const tok = await getIdToken();
  if (tok) headers.set('Authorization', `Bearer ${tok}`);
  const url = method === 'DELETE'
    ? `/api/mail/recipients/${encodeURIComponent(email)}`
    : '/api/mail/recipients';
  const r = await fetch(url, {
    method,
    headers,
    ...(method === 'POST' ? { body: JSON.stringify({ email }) } : {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
  return Array.isArray(data.recipients) ? data.recipients : [];
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

Section.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
};

export function SettingsPanel({ open, onClose, onOpenDocs, variant = 'modal' }) {
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
  const [canManageRecipients, setCanManageRecipients] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [newRecipient, setNewRecipient] = useState('');
  const [recipientBusy, setRecipientBusy] = useState(false);
  const accountEmail = user?.email ?? '';
  const canUseMailing = Boolean(user) || !authRequired;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setMailFeedback(null);
      setMailPrefsLoading(true);
      try {
        const prefs = await loadMailingPreferences({ user, authRequired, apiReady, getIdToken, lang });
        if (!cancelled) {
          setMailServerEnabled(prefs.mailServerEnabled);
          setCanManageRecipients(prefs.canManageRecipients);
          setSavedMailingEmail(prefs.savedMailingEmail);
          setMailingEmail(prefs.mailingEmail);
          setMailingLanguage(prefs.mailingLanguage);
          setProducts(prefs.products);
        }
        if (prefs.canManageRecipients) {
          const list = await fetchRecipients(getIdToken).catch(() => []);
          if (!cancelled) setRecipients(list);
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
    } else if (!canManageRecipients && !savedMailingEmail && accountEmail) {
      // Never auto-fill a personal destination for a mailing admin: the server
      // deliberately blanked it when folding their address onto the shared list,
      // and refilling it here would resurrect the duplicate delivery path.
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
  }, [accountEmail, canManageRecipients, canUseMailing, getIdToken, mailingEmail, mailingLanguage, products, savedMailingEmail]);

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

  const handleAddRecipient = useCallback(async () => {
    const email = newRecipient.trim();
    if (!email) return;
    setRecipientBusy(true);
    setMailFeedback(null);
    try {
      setRecipients(await mutateRecipients(getIdToken, { method: 'POST', email }));
      setNewRecipient('');
    } catch (e) {
      setMailFeedback({ severity: 'error', message: e?.message ?? t('settings.mailingRecipientAddError') });
    } finally {
      setRecipientBusy(false);
    }
  }, [getIdToken, newRecipient, t]);

  const handleRemoveRecipient = useCallback(async (email) => {
    setRecipientBusy(true);
    setMailFeedback(null);
    try {
      setRecipients(await mutateRecipients(getIdToken, { method: 'DELETE', email }));
    } catch (e) {
      setMailFeedback({ severity: 'error', message: e?.message ?? t('settings.mailingRecipientRemoveError') });
    } finally {
      setRecipientBusy(false);
    }
  }, [getIdToken, t]);

  // Your own address is delivered via your preferences row rather than the shared
  // list, so merge it in — otherwise no single place shows who gets the digest.
  const recipientRows = buildDigestRecipientRows({
    storedRecipients: recipients,
    selfEmail: savedMailingEmail || accountEmail,
  });

  const showLocalOnlyNote = !mailServerEnabled;
  const mailingActionsDisabled = !canUseMailing || mailPrefsLoading || saveBusy || sendBusy;

  const body = (
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
            {t(canManageRecipients ? 'settings.mailingIntroShared' : 'settings.mailingIntro')}
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

          {/* Mailing admins have no personal destination: their address lives on
              the shared list below, which is the single roster. Users without
              list access still need this field to say where their digest goes. */}
          {!canManageRecipients && (
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
          )}

          {!canManageRecipients && (savedMailingEmail || accountEmail) && (
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
            helperText={t(canManageRecipients ? 'settings.mailingLanguageHelpShared' : 'settings.mailingLanguageHelp')}
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

          {canManageRecipients && (
            <Box sx={{ marginBottom: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ marginBottom: 0.5, fontWeight: 600 }}>
                {t('settings.mailingRecipientsHeading')}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginBottom: 1 }}>
                {t('settings.mailingRecipientsSub')}
              </Typography>

              {/* Empty state tracks the stored list, not the rendered rows: your
                  own address always occupies a row but is not "a recipient". */}
              {recipients.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginBottom: 1 }}>
                  {t('settings.mailingRecipientsEmpty')}
                </Typography>
              )}

              {recipientRows.length > 0 && (
                <List dense disablePadding sx={{ marginBottom: 1 }}>
                  {recipientRows.map((r) => (
                    <ListItem
                      key={r.email}
                      disableGutters
                      secondaryAction={r.removable ? (
                        <IconButton
                          edge="end"
                          size="small"
                          aria-label={t('settings.mailingRecipientRemove').replace('{email}', r.email)}
                          disabled={recipientBusy}
                          onClick={() => void handleRemoveRecipient(r.email)}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      ) : null}
                    >
                      <ListItemText
                        primary={r.email}
                        secondary={r.isSelf ? t('settings.mailingRecipientSelf') : null}
                        slotProps={{ primary: { variant: 'body2' }, secondary: { variant: 'caption' } }}
                      />
                    </ListItem>
                  ))}
                </List>
              )}

              <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <TextField
                  size="small"
                  fullWidth
                  type="email"
                  label={t('settings.mailingRecipientAddLabel')}
                  value={newRecipient}
                  onChange={(e) => setNewRecipient(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAddRecipient();
                    }
                  }}
                  disabled={recipientBusy}
                />
                <Button
                  variant="outlined"
                  size="small"
                  sx={{ marginTop: 0.25 }}
                  disabled={recipientBusy || !newRecipient.trim()}
                  onClick={() => void handleAddRecipient()}
                >
                  {t('settings.mailingRecipientAdd')}
                </Button>
              </Stack>
            </Box>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ marginBottom: 1, fontWeight: 600 }}>
            {t('settings.mailingProductsHeading')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginBottom: 1.5 }}>
            {t(canManageRecipients ? 'settings.mailingProductsSubShared' : 'settings.mailingProductsSub')}
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
              <Button variant="outlined" size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => { logout(); }}>
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
  );

  if (variant === 'window') {
    return (
      <PanelWindowShell
        title={t('settings.title')}
        ariaLabel={t('settings.title')}
      >
        {body}
      </PanelWindowShell>
    );
  }

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
      {body}
    </ModalPanel>
  );
}

SettingsPanel.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onOpenDocs: PropTypes.func,
  variant: PropTypes.oneOf(['modal', 'window']),
};
