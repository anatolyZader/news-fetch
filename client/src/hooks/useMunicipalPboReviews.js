import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '../lib/authFetch.js';
import { localizedAuthFetch } from '../lib/localizedAuthFetch.js';

/** Load municipal PBO completeness reviews for one date. */
export function useMunicipalPboReviews({ date, lang = 'en', getIdToken, getAppCheckToken, apiReady }) {
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
      const json = await localizedAuthFetch(
        `/api/pbo/municipal-reviews?date=${encodeURIComponent(date)}`,
        { lang, getIdToken, getAppCheckToken },
      );
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
  }, [date, lang, getIdToken, getAppCheckToken]);

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
export function useMunicipalPboReviewDetail({
  date,
  municipality,
  lang = 'en',
  getIdToken,
  getAppCheckToken,
  apiReady,
}) {
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
      const path = `/api/pbo/municipal-reviews/${encodeURIComponent(date)}/${encodeURIComponent(municipality)}`;
      const json = await localizedAuthFetch(path, { lang, getIdToken, getAppCheckToken });
      setDetail(json);
    } catch (e) {
      if (e?.status === 404) {
        setDetail(null);
        return;
      }
      setError(e?.message ?? 'Failed');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [date, municipality, lang, getIdToken, getAppCheckToken]);

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
    const path = `/api/pbo/municipal-reviews/${encodeURIComponent(date)}/${encodeURIComponent(municipality)}/replies`;
    const json = await authFetch(path, {
      method: 'POST',
      body: { answers },
      getIdToken,
      getAppCheckToken,
    });
    setDetail(json.review ? { ...json.review, replies: detail?.replies ?? [] } : detail);
    await reload();
    return json;
  }, [date, municipality, detail, getIdToken, getAppCheckToken, reload]);

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
