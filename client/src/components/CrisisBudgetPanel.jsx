import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Analyst HITL control for crisis chat budget pool.
 */
export function CrisisBudgetPanel({ budgetStatus, suggestCrisisBudget, onUpdated }) {
  const { t } = useLanguage();
  const { getIdToken } = useAuth();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!budgetStatus && !suggestCrisisBudget) return null;

  const crisisActive = budgetStatus?.crisis_active === true;
  const showPanel = suggestCrisisBudget || crisisActive || budgetStatus?.daily_exceeded;

  if (!showPanel) return null;

  async function callApi(path, body) {
    setBusy(true);
    setError(null);
    try {
      const token = await getIdToken?.();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body ?? {}),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      onUpdated?.(data.status ?? data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Alert severity={crisisActive ? 'success' : 'warning'} variant="outlined">
      <Stack spacing={1.25}>
        <Typography variant="subtitle2">{t('crisisBudget.panelTitle')}</Typography>
        {suggestCrisisBudget && !crisisActive && (
          <Typography variant="body2">{t('crisisBudget.operatorSuggest')}</Typography>
        )}
        {budgetStatus?.daily_exceeded && (
          <Typography variant="caption" color="text.secondary">
            Daily budget exceeded (${budgetStatus.spent?.toFixed?.(2) ?? budgetStatus.spent} / ${budgetStatus.limit})
          </Typography>
        )}
        {crisisActive && (
          <Typography variant="body2">
            {t('crisisBudget.activeUntil', { expires: budgetStatus.session?.expires_at ?? '—' })}
          </Typography>
        )}
        {!crisisActive && (
          <>
            <TextField
              size="small"
              label={t('crisisBudget.reasonLabel')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              multiline
              minRows={2}
            />
            <Button
              size="small"
              variant="contained"
              disabled={busy || !reason.trim()}
              onClick={() => callApi('/api/budget/crisis/activate', { reason: reason.trim() })}
            >
              {t('crisisBudget.activate')}
            </Button>
          </>
        )}
        {crisisActive && (
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            disabled={busy}
            onClick={() => callApi('/api/budget/crisis/deactivate')}
          >
            {t('crisisBudget.deactivate')}
          </Button>
        )}
        {error && (
          <Typography variant="caption" color="error">{error}</Typography>
        )}
      </Stack>
    </Alert>
  );
}

CrisisBudgetPanel.propTypes = {
  budgetStatus: PropTypes.object,
  suggestCrisisBudget: PropTypes.bool,
  onUpdated: PropTypes.func,
};
