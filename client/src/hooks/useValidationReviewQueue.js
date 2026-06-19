import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { withLang } from '../lib/localeFetch.js';

/**
 * @param {string | null} date
 * @param {string} scope
 * @param {{ enabled?: boolean }} [opts]
 */
export function useValidationReviewQueue(date, scope, opts = {}) {
  const { getIdToken, apiReady } = useAuth();
  const enabled = opts.enabled !== false;
  const lang = opts.lang ?? 'en';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  const load = useCallback(async () => {
    if (!apiReady || !date || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const params = new URLSearchParams({ date, status: 'pending' });
      if (scope && scope !== 'national') params.set('scope', scope);
      const res = await fetch(withLang(`/api/validation/review-queue?${params}`, lang), { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err?.message ?? 'Failed to load validation queue');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiReady, date, scope, enabled, getIdToken, lang]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const submitDecision = useCallback(async (articleKey, action, payload = {}) => {
    if (!date || !articleKey) return null;
    setSavingKey(articleKey);
    setError(null);
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const encKey = encodeURIComponent(articleKey);
      const encScope = encodeURIComponent(scope ?? 'national');
      const res = await fetch(
        `/api/validation/review-queue/${encodeURIComponent(date)}/${encScope}/${encKey}/decision`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ action, payload }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setItems((prev) => prev.filter((i) => i.article_key !== articleKey));
      return data;
    } catch (err) {
      setError(err?.message ?? 'Failed to save decision');
      return null;
    } finally {
      setSavingKey(null);
    }
  }, [date, scope, getIdToken]);

  const fetchContext = useCallback(async (articleKey) => {
    if (!apiReady || !date || !articleKey) return null;
    try {
      const headers = new Headers();
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const encKey = encodeURIComponent(articleKey);
      const encScope = encodeURIComponent(scope ?? 'national');
      const res = await fetch(
        withLang(
          `/api/validation/review-queue/${encodeURIComponent(date)}/${encScope}/${encKey}/context`,
          lang,
        ),
        { headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      return data;
    } catch {
      return null;
    }
  }, [apiReady, date, scope, getIdToken, lang]);

  const explainItem = useCallback(async (articleKey, question) => {
    if (!apiReady || !date || !articleKey) return null;
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const encKey = encodeURIComponent(articleKey);
      const encScope = encodeURIComponent(scope ?? 'national');
      const res = await fetch(
        `/api/validation/review-queue/${encodeURIComponent(date)}/${encScope}/${encKey}/explain`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ question: question || 'Why was this flagged?' }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      return data;
    } catch (err) {
      setError(err?.message ?? 'Explain failed');
      return null;
    }
  }, [apiReady, date, scope, getIdToken]);

  const agentTurn = useCallback(async (articleKey, messages, opts = {}) => {
    if (!apiReady || !date || !articleKey) return null;
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const token = await getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const encKey = encodeURIComponent(articleKey);
      const encScope = encodeURIComponent(scope ?? 'national');
      let payloadMessages = messages ?? [];
      const followUp = String(opts.followUp ?? '').trim();
      if (followUp) {
        payloadMessages = [...payloadMessages, { role: 'user', content: followUp }];
      }
      const res = await fetch(
        `/api/validation/review-queue/${encodeURIComponent(date)}/${encScope}/${encKey}/agent`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ messages: payloadMessages }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      return data;
    } catch (err) {
      setError(err?.message ?? 'Agent failed');
      return null;
    }
  }, [apiReady, date, scope, getIdToken]);

  return {
    items,
    loading,
    error,
    savingKey,
    reload: load,
    submitDecision,
    fetchContext,
    explainItem,
    agentTurn,
  };
}
