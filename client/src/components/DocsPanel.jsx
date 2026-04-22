import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { MarkdownDocView } from './MarkdownDocView.jsx';
import styles from './DocsPanel.module.css';

async function fetchJson(url, { token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  const contentType = res.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

function canonicalFromMeta(meta) {
  const raw = meta?.canonical;
  return typeof raw === 'string' && raw.startsWith('http') ? raw : null;
}

export function DocsPanel({ open, onClose }) {
  const { getIdToken, authRequired, user } = useAuth();
  const overlayRef = useRef(null);
  const [index, setIndex] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState('getting-started/quickstart');
  const [query, setQuery] = useState('');
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(null);

  const loadIndex = useCallback(async () => {
    setLoadingIndex(true);
    setError(null);
    try {
      const token = await getIdToken();
      const data = await fetchJson('/api/docs/index', { token });
      setIndex(Array.isArray(data.pages) ? data.pages : []);
    } catch (err) {
      setError(err?.message ?? 'Failed to load docs index');
    } finally {
      setLoadingIndex(false);
    }
  }, [getIdToken]);

  const loadPage = useCallback(
    async (slug) => {
      if (!slug) return;
      setLoadingPage(true);
      setError(null);
      try {
        const token = await getIdToken();
        const data = await fetchJson(`/api/docs/page/${encodeURIComponent(slug)}`, { token });
        setPage(data);
      } catch (err) {
        setPage(null);
        if (err?.status === 401 && authRequired && !user) {
          setError('This page is locked. Sign in to access playbooks.');
        } else {
          setError(err?.message ?? 'Failed to load page');
        }
      } finally {
        setLoadingPage(false);
      }
    },
    [getIdToken, authRequired, user],
  );

  useEffect(() => {
    if (!open) return;
    void loadIndex();
  }, [open, loadIndex]);

  useEffect(() => {
    if (!open) return;
    void loadPage(selectedSlug);
  }, [open, selectedSlug, loadPage]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return index;
    return index.filter((p) => {
      const hay = `${p.title ?? ''} ${p.slug ?? ''} ${p.description ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [index, query]);

  const fullDocsUrl = useMemo(() => {
    const direct = canonicalFromMeta(page?.meta);
    if (direct) return direct;
    const idxCanonical = index.find((p) => p.slug === selectedSlug)?.canonical;
    if (typeof idxCanonical === 'string' && idxCanonical.startsWith('http')) return idxCanonical;
    const slugPath = String(selectedSlug ?? '').replace(/^\/+/, '');
    return slugPath ? `https://docs.vibeswitch.ai/${slugPath}` : 'https://docs.vibeswitch.ai';
  }, [page?.meta, index, selectedSlug]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Documentation"
      ref={overlayRef}
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose?.();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>Docs</div>
          <div className={styles.headerRight}>
            <a className={styles.headerLink} href={fullDocsUrl} target="_blank" rel="noreferrer">
              Open full docs
            </a>
            <button type="button" className={styles.close} onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className={styles.body}>
          <aside className={styles.sidebar}>
            <input
              className={styles.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={loadingIndex ? 'Loading…' : 'Search docs…'}
              aria-label="Search docs"
            />
            <nav className={styles.nav} aria-label="Docs navigation">
              {filtered.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  className={`${styles.navItem} ${selectedSlug === p.slug ? styles.navItemActive : ''}`}
                  onClick={() => setSelectedSlug(p.slug)}
                >
                  <span>{p.title ?? p.slug}</span>
                  {p.locked && <span className={styles.lockedTag}>Locked</span>}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className={styles.empty}>No matches.</div>
              )}
            </nav>
          </aside>

          <section className={styles.content} aria-label="Docs content">
            {error && <div className={styles.error}>{error}</div>}
            {!error && loadingPage && <div className={styles.empty}>Loading…</div>}
            {!error && !loadingPage && (
              <MarkdownDocView
                markdown={page?.markdown ?? ''}
                banner={
                  page?.meta?.stability
                    ? `Stability: ${page.meta.stability}`
                    : null
                }
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

