import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PropTypes from 'prop-types';

import { useAuth } from '../context/AuthContext.jsx';
import { buildAuthHeaders } from '../lib/authFetch.js';
import { StatusTag } from '../ui/index.js';

export function CatalogProposalPanel({ enabled = false }) {
  const { getIdToken, getAppCheckToken, apiReady } = useAuth();
  const [open, setOpen] = useState(true);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    if (!apiReady || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const res = await fetch('/api/catalog-learning/proposals?status=draft', { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setProposals(Array.isArray(data.proposals) ? data.proposals : []);
    } catch (err) {
      setError(err?.message ?? 'Failed to load proposals');
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [apiReady, enabled, getIdToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generateProposals() {
    setGenerating(true);
    setError(null);
    try {
      const headers = await buildAuthHeaders({ getIdToken, getAppCheckToken });
      headers.set('Content-Type', 'application/json');
      const res = await fetch('/api/catalog-learning/proposals/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ maxDays: 14, topN: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err?.message ?? 'Generate failed');
    } finally {
      setGenerating(false);
    }
  }

  async function reviewProposal(id, status) {
    setSavingId(id);
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const res = await fetch(`/api/catalog-learning/proposals/${encodeURIComponent(id)}/review`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status, note: '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setProposals((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err?.message ?? 'Review failed');
    } finally {
      setSavingId(null);
    }
  }

  if (!enabled) return null;

  return (
    <Box
      component="section"
      aria-label="Catalog proposals"
      sx={(theme) => ({
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        overflow: 'hidden',
        background: theme.palette.background.paper,
        marginTop: theme.spacing(1.5),
      })}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={(theme) => ({
          padding: theme.spacing(1.25, 1.5),
          borderBottom: open ? theme.custom.border.hairline : 'none',
          background: theme.palette.action.hover,
          cursor: 'pointer',
        })}
        onClick={() => setOpen((v) => !v)}
      >
        <Typography variant="cardTitle" sx={{ flex: 1 }}>
          Catalog draft proposals
        </Typography>
        <StatusTag variant="neutral">{loading ? '…' : String(proposals.length)}</StatusTag>
        <IconButton size="small" aria-expanded={open}>
          <ExpandMoreIcon fontSize="small" sx={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </IconButton>
      </Stack>
      <Collapse in={open}>
        <Box sx={(theme) => ({ padding: theme.spacing(1.5) })}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginBottom: 1 }}>
            Human-in-the-loop only — approving does not edit signalCatalog.js. Merge manually after review.
          </Typography>
          {error && (
            <Alert severity="error" variant="outlined" sx={{ marginBottom: 1 }}>{error}</Alert>
          )}
          <Button
            size="small"
            variant="outlined"
            disabled={generating}
            onClick={generateProposals}
            sx={{ marginBottom: 1 }}
          >
            {generating ? 'Generating…' : 'Generate from OOV clusters'}
          </Button>
          {!loading && proposals.length === 0 && (
            <Typography variant="body2" color="text.secondary">No draft proposals.</Typography>
          )}
          <Stack spacing={1.5}>
            {proposals.map((p) => {
              const body = p.proposal_json ?? {};
              return (
                <Box
                  key={p.id}
                  sx={(theme) => ({
                    border: theme.custom.border.hairline,
                    borderRadius: `${theme.custom.radius.section}px`,
                    padding: theme.spacing(1.25),
                  })}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {body.suggested_signal_type ?? p.cluster_key}
                  </Typography>
                  {body.suggested_label && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {body.suggested_label}
                    </Typography>
                  )}
                  {body.suggested_definition && (
                    <Typography variant="caption" sx={{ display: 'block', marginTop: 0.5 }}>
                      {String(body.suggested_definition).slice(0, 300)}
                    </Typography>
                  )}
                  {body.rationale && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginTop: 0.5 }}>
                      {body.rationale}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={0.75} sx={{ marginTop: 1 }}>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={savingId === p.id}
                      onClick={() => reviewProposal(p.id, 'approved')}
                    >
                      Approve draft
                    </Button>
                    <Button
                      size="small"
                      variant="text"
                      disabled={savingId === p.id}
                      onClick={() => reviewProposal(p.id, 'rejected')}
                    >
                      Reject
                    </Button>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

CatalogProposalPanel.propTypes = {
  enabled: PropTypes.bool,
};
