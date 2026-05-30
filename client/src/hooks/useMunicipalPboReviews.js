import { useCallback, useEffect, useState } from 'react';

async function readFetchErrorMessage(res) {
  try {
    const json = await res.json();
    return json?.error ?? json?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Load municipal PBO completeness reviews for one date. */
export function useMunicipalPboReviews({ date, getIdToken, apiReady }) {
  const [reviewsByMuni, setReviewsByMuni] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!date) {
      setReviewsByMuni({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken?.();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const res = await fetch(`/api/pbo/municipal-reviews?date=${encodeURIComponent(date)}`, { headers });
      if (!res.ok) throw new Error(await readFetchErrorMessage(res));
      const json = await res.json();
      const map = {};
      for (const review of json.reviews ?? []) {
        map[review.municipality] = review;
      }
      setReviewsByMuni(map);
    } catch (e) {
      setError(e?.message ?? 'Failed');
      setReviewsByMuni({});
    } finally {
      setLoading(false);
    }
  }, [date, getIdToken]);

  useEffect(() => {
    if (!apiReady) return undefined;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void reload();
    });
    return () => {
      cancelled = true;
    };
  }, [apiReady, reload]);

  return { reviewsByMuni, loading, error, reload };
}

/** Fetch one municipal review with questions and replies. */
export function useMunicipalPboReviewDetail({ date, municipality, getIdToken, apiReady }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!date || !municipality) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const token = await getIdToken?.();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const path = `/api/pbo/municipal-reviews/${encodeURIComponent(date)}/${encodeURIComponent(municipality)}`;
      const res = await fetch(path, { headers });
      if (res.status === 404) {
        setDetail(null);
        return;
      }
      if (!res.ok) throw new Error(await readFetchErrorMessage(res));
      setDetail(await res.json());
    } catch (e) {
      setError(e?.message ?? 'Failed');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [date, municipality, getIdToken]);

  useEffect(() => {
    if (!apiReady) return undefined;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void reload();
    });
    return () => {
      cancelled = true;
    };
  }, [apiReady, reload]);

  const submitReply = useCallback(async (answers) => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const token = await getIdToken?.();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const path = `/api/pbo/municipal-reviews/${encodeURIComponent(date)}/${encodeURIComponent(municipality)}/replies`;
    const res = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) throw new Error(await readFetchErrorMessage(res));
    const json = await res.json();
    setDetail(json.review ? { ...json.review, replies: detail?.replies ?? [] } : detail);
    await reload();
    return json;
  }, [date, municipality, detail, getIdToken, reload]);

  return { detail, loading, error, reload, submitReply };
}

export function reviewStatusLabel(review, t) {
  if (!review) return t('pboReview.status.notReviewed');
  if (review.sufficient || review.status === 'resolved') return t('pboReview.status.complete');
  if (review.status === 'partially_resolved') return t('pboReview.status.partial');
  if (review.emailSentAt) return t('pboReview.status.gapsEmailed');
  return t('pboReview.status.gaps');
}

export function reviewStatusTone(review) {
  if (!review) return 'default';
  if (review.sufficient || review.status === 'resolved') return 'success';
  if (review.status === 'partially_resolved') return 'warning';
  return 'error';
}
