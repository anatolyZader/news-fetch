import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { expandSourceCitationLinks } from './ReportMarkdownView.jsx';
import styles from './SubmissionsTab.module.css';

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function scoreColor(s) {
  if (s <= 2) return 'var(--score-critical)';
  if (s <= 4) return 'var(--score-weak)';
  if (s <= 6) return 'var(--score-moderate)';
  if (s <= 8) return 'var(--score-good)';
  return 'var(--score-strong)';
}

function scoreLabel(s) {
  if (s <= 2) return 'Critical';
  if (s <= 4) return 'Weak';
  if (s <= 6) return 'Moderate';
  if (s <= 8) return 'Good';
  return 'Strong';
}

function VideoTimeline({ timeline }) {
  return (
    <ol className={styles.videoTimeline}>
      {timeline.map((seg, idx) => (
        <li key={idx} className={styles.videoSegment}>
          <div className={styles.videoSceneHeader}>
            <a href={seg.url} target="_blank" rel="noreferrer" className={styles.videoSceneLink}>
              {seg.headline ?? `Scene ${idx + 1}`}
            </a>
            {seg.quality === 'low' && <span className={styles.videoSceneQuality}>low signal</span>}
          </div>
          <p className={styles.videoSegmentText}>{seg.text}</p>
        </li>
      ))}
    </ol>
  );
}

function AnalysisSummary({ analysis, t }) {
  const comps = analysis.components ?? [];
  return (
    <div className={styles.analysisSummary}>
      <div className={styles.componentGrid}>
        {comps.map((c) => (
          <div key={c.component_id} className={styles.componentPill}>
            <span className={styles.compName}>{c.component_id.replace(/_/g, ' ')}</span>
            <span className={styles.compScore} style={{ color: scoreColor(c.score) }}>
              {c.score != null ? scoreLabel(c.score) : '—'}
            </span>
          </div>
        ))}
      </div>
      {analysis.cross_component_synthesis && (
        <details className={styles.synthToggle}>
          <summary className={styles.synthSummary}>{t('sub.synthesis')}</summary>
          <div className={styles.synthBody}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {expandSourceCitationLinks(analysis.cross_component_synthesis)}
            </ReactMarkdown>
          </div>
        </details>
      )}
    </div>
  );
}

function SubmissionCard({ sub, t }) {
  const hasVideo = sub.extractedContentJson?.videoTimeline?.length > 0;
  const hasAnalysis = sub.analysisJson != null;
  const isTextOnly = !sub.detectedUrl && !hasVideo && !hasAnalysis;
  const isPending = sub.analysisStatus === 'queued' || sub.ingestStatus === 'queued';
  const isFailed = sub.analysisStatus === 'failed' || sub.ingestStatus === 'failed';

  return (
    <div className={styles.card}>
      <div className={styles.cardMeta}>
        <span className={styles.cardTime}>{formatTime(sub.createdAt)}</span>
        {isPending && <span className={styles.statusPending}>{t('sub.processing')}</span>}
        {isFailed && <span className={styles.statusFailed}>{t('sub.failed')}</span>}
        {isTextOnly && <span className={styles.statusStored}>{t('sub.stored')}</span>}
        {!isPending && !isFailed && !isTextOnly && <span className={styles.statusDone}>{t('sub.analysed')}</span>}
      </div>

      <p className={styles.cardContent}>
        {sub.detectedUrl
          ? <a href={sub.detectedUrl} target="_blank" rel="noreferrer">{sub.detectedUrl}</a>
          : sub.rawContent}
      </p>

      {hasVideo && (
        <details className={styles.section}>
          <summary className={styles.sectionToggle}>
            <span className={styles.sectionChevron}>›</span>
            {t('sub.video')}
            <span className={styles.sectionCount}>
              {sub.extractedContentJson.videoTimeline.length} {t('sub.scenes')}
            </span>
          </summary>
          <VideoTimeline timeline={sub.extractedContentJson.videoTimeline} />
        </details>
      )}

      {hasAnalysis && (
        <details className={styles.section}>
          <summary className={styles.sectionToggle}>
            <span className={styles.sectionChevron}>›</span>
            {t('sub.analysis')}
          </summary>
          <AnalysisSummary analysis={sub.analysisJson} t={t} />
        </details>
      )}
    </div>
  );
}

export function SubmissionsTab() {
  const { getIdToken, apiReady } = useAuth();
  const { t } = useLanguage();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = new Headers();
      const t = await getIdToken();
      if (t) headers.set('Authorization', `Bearer ${t}`);
      const r = await fetch('/api/evidence-submissions?limit=10', { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setSubmissions(data.submissions ?? []);
    } catch (e) {
      setError(e?.message ?? 'Could not load submissions');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (apiReady) load();
  }, [apiReady, load]);

  if (loading) return <p className={styles.hint}>{t('sub.loading')}</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (submissions.length === 0) return <p className={styles.hint}>{t('sub.empty')}</p>;

  return (
    <div className={styles.list}>
      {submissions.map((sub) => <SubmissionCard key={sub.id} sub={sub} t={t} />)}
    </div>
  );
}
