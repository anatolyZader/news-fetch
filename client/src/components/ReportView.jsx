import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './ReportView.module.css';
import { expandSourceCitationLinks } from './ReportMarkdownView.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

const ICONS = {
  narrative: '📖',
  information_communication: '📡',
  lifesaving_behavior: '🛡️',
  functional_continuity: '⚙️',
  community_capital: '🤝',
  leadership: '👤',
  belonging_solidarity: '🔗',
  wellbeing_atrisk: '❤️',
};

function scoreColor(s) {
  if (s <= 2) return 'var(--score-critical)';
  if (s <= 4) return 'var(--score-weak)';
  if (s <= 6) return 'var(--score-moderate)';
  if (s <= 8) return 'var(--score-good)';
  return 'var(--score-strong)';
}

function scoreLabel(s, t) {
  if (s <= 2) return t('score.critical');
  if (s <= 4) return t('score.weak');
  if (s <= 6) return t('score.moderate');
  if (s <= 8) return t('score.good');
  return t('score.strong');
}

function ComponentCard({ comp, t }) {
  const icon = ICONS[comp.component_id] ?? '•';
  const label = t(`comp.${comp.component_id}`) ?? comp.component_id.replace(/_/g, ' ');
  const confidenceLabel = t(`confidence.${comp.confidence}`) ?? comp.confidence;

  return (
    <details className={styles.card}>
      <summary className={styles.cardHeader}>
        <span className={styles.chevron}>›</span>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.compName}>{label}</span>
        <span className={styles.confidence}>{confidenceLabel}</span>
      </summary>
      <div className={styles.cardBody}>
        <div className={styles.proseMd}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {expandSourceCitationLinks(comp.narrative ?? '')}
          </ReactMarkdown>
        </div>

        {comp.evidence?.length > 0 && (
          <details className={styles.evidenceDetails}>
            <summary className={styles.evidenceToggle}>
              <span className={styles.evidenceChevron}>›</span>
              <span>{t('report.evidence')}</span>
              <span className={styles.evidenceCount}>{comp.evidence.length} {t('report.items')}</span>
            </summary>
            <div className={styles.evidenceBody}>
              <ul className={styles.evidenceList}>
                {comp.evidence.map((e, i) => (
                  <li key={i} className={styles.proseMd}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{expandSourceCitationLinks(e)}</ReactMarkdown>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>
    </details>
  );
}

const SCRIPT_LABELS = {
  'analyze-resilience':  'analysis',
  'extract-homefront':   'extraction',
  'translation-he':      'transl. HE',
  'translation-ru':      'transl. RU',
  'audio-to-md':         'transcription',
};

function CostBreakdown({ breakdown, fallback }) {
  if (breakdown) {
    const entries = Object.entries(breakdown)
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => (SCRIPT_LABELS[a] ?? a).localeCompare(SCRIPT_LABELS[b] ?? b));
    if (entries.length > 0) {
      return (
        <span>
          {' · '}
          {entries.map(([script, cost], i) => (
            <span key={script}>
              {i > 0 && ' · '}
              {SCRIPT_LABELS[script] ?? script} ${cost.toFixed(4)}
            </span>
          ))}
        </span>
      );
    }
  }
  if (fallback != null) return <span>{` · $${fallback.toFixed(4)}`}</span>;
  return null;
}

export function ReportView({ assessment, costUsd, costBreakdown, readOnly, translating, translateError }) {
  const { t } = useLanguage();
  const overall = assessment.overall_resilience_score;

  return (
    <div className={styles.root}>
      {translating && (
        <p className={styles.readOnlyBanner} role="status">{t('report.translating')}</p>
      )}
      {translateError && (
        <p className={styles.readOnlyBanner} role="alert" style={{ color: 'var(--score-critical)' }}>
          Translation error: {translateError}
        </p>
      )}

      {/* ── Overall header ── */}
      <div className={styles.overallRow}>
        <div className={styles.overallScore} style={{ color: scoreColor(overall) }}>
          {scoreLabel(overall, t)}
        </div>
        <div>
          <div className={styles.overallLabel}>{t('report.overallLabel')}</div>
          <div className={styles.meta}>
            {assessment.date} · {assessment.total_articles_analyzed} {t('report.articles')}
            <CostBreakdown breakdown={costBreakdown} fallback={costUsd} />
          </div>
        </div>
      </div>

      {/* ── Component pills ── */}
      <div className={styles.pills}>
        {(assessment.components ?? []).map((c) => (
          <div key={c.component_id} className={styles.pill}>
            <span>{ICONS[c.component_id]}</span>
            <span className={styles.pillName}>
              {t(`comp.${c.component_id}`) ?? c.component_id.replace(/_/g, ' ')}
            </span>
            <span className={styles.pillScore} style={{ color: scoreColor(c.score) }}>
              {scoreLabel(c.score, t)}
            </span>
          </div>
        ))}
      </div>

      {/* ── Executive summary ── */}
      <section className={styles.section}>
        <h2>{t('report.executiveSummary')}</h2>
        <div className={styles.proseMd}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {expandSourceCitationLinks(assessment.cross_component_synthesis ?? '')}
          </ReactMarkdown>
        </div>
      </section>

      {/* ── Component cards ── */}
      <section className={styles.section}>
        <h2>{t('report.components')}</h2>
        {(assessment.components ?? []).map((c) => (
          <ComponentCard key={c.component_id} comp={c} t={t} />
        ))}
      </section>

      {/* ── Caveats ── */}
      {assessment.media_bias_caveats && (
        <section className={styles.section}>
          <h2>{t('report.caveats')}</h2>
          <div className={`${styles.muted} ${styles.proseMd}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {expandSourceCitationLinks(assessment.media_bias_caveats)}
            </ReactMarkdown>
          </div>
        </section>
      )}
    </div>
  );
}
