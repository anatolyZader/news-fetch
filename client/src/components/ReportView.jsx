import { useEffect, useRef, useState } from 'react';
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


function ComponentCard({
  comp,
  t,
  sourceSignals,
  open,
  evidenceOpen,
  onToggle,
  onEvidenceToggle,
  cardRef,
}) {
  const icon = ICONS[comp.component_id] ?? '•';
  const label = t(`comp.${comp.component_id}`) ?? comp.component_id.replace(/_/g, ' ');
  const confidenceLabel = t(`confidence.${comp.confidence}`) ?? comp.confidence;

  // When a source filter is active, show that source's raw signals as evidence.
  // When full, show the LLM-curated evidence strings.
  const isFiltered = sourceSignals !== null && sourceSignals !== undefined;
  const signals = isFiltered ? (sourceSignals ?? []) : null;
  const curatedEvidence = isFiltered ? null : (comp.evidence ?? []);

  const evidenceCount = isFiltered
    ? signals.length
    : curatedEvidence.length;

  return (
    <details ref={cardRef} className={styles.card} open={open} onToggle={onToggle}>
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

        {evidenceCount > 0 && (
          <details className={styles.evidenceDetails} open={evidenceOpen} onToggle={onEvidenceToggle}>
            <summary className={styles.evidenceToggle}>
              <span className={styles.evidenceChevron}>›</span>
              <span>{t('report.evidence')}</span>
              <span className={styles.evidenceCount}>{evidenceCount} {t('report.items')}</span>
            </summary>
            <div className={styles.evidenceBody}>
              <ul className={styles.evidenceList}>
                {isFiltered
                  ? signals.map((s, i) => (
                      <li key={i} className={styles.signalItem}>
                        <span className={styles.signalSource}>
                          {s.source_type === 'field' && (
                            <span className={styles.fieldBadge}>{t('report.badge.field')}</span>
                          )}
                          {s.source_type === 'radio' && (
                            <span className={styles.radioBadge}>{t('report.badge.radio')}</span>
                          )}
                          {s.source_type === 'naftali' && (
                            <span className={styles.naftaliBadge}>{t('report.badge.naftali')}</span>
                          )}
                          {(s.source_type === 'news' || s.source_type === 'press') && (
                            <span className={styles.pressBadge}>{t('report.badge.press')}</span>
                          )}
                          {s.source_type === 'pbo' && (
                            <span className={styles.pboBadge}>{t('report.badge.pbo')}</span>
                          )}
                          {s.source_type === 'pbo' ? s.article_source?.replace(/^pbo-/, '') : s.article_source}
                        </span>
                        <span className={styles.signalEvidence}>{s.evidence}</span>
                      </li>
                    ))
                  : curatedEvidence.map((e, i) => (
                      <li key={i} className={styles.proseMd}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{expandSourceCitationLinks(e)}</ReactMarkdown>
                      </li>
                    ))
                }
              </ul>
            </div>
          </details>
        )}

        {isFiltered && signals.length === 0 && (
          <p className={styles.noSourceEvidence}>{t('report.noSourceEvidence') ?? 'No signals from this source for this component.'}</p>
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

const SOURCE_LABELS = { full: 'Full', news: 'News', radio: 'Radio', field: 'Field' };

export function ReportView({
  assessment,
  costUsd,
  costBreakdown,
  scoreBySource,
  readOnly,
  translating,
  translateError,
  openCompId: openCompIdProp,
  setOpenCompId: setOpenCompIdProp,
  openEvidenceCompId: openEvidenceCompIdProp,
  setOpenEvidenceCompId: setOpenEvidenceCompIdProp,
}) {
  const { t } = useLanguage();
  const overall = assessment.overall_resilience_score;
  const [activeSource, setActiveSource] = useState('full');
  const [openCompIdInternal, setOpenCompIdInternal] = useState(null);
  const [openEvidenceCompIdInternal, setOpenEvidenceCompIdInternal] = useState(null);
  const compRefs = useRef({});

  const openCompId = openCompIdProp ?? openCompIdInternal;
  const setOpenCompId = setOpenCompIdProp ?? setOpenCompIdInternal;
  const openEvidenceCompId = openEvidenceCompIdProp ?? openEvidenceCompIdInternal;
  const setOpenEvidenceCompId = setOpenEvidenceCompIdProp ?? setOpenEvidenceCompIdInternal;

  // When scoreBySource changes (e.g. new report loaded), reset to full
  // UI only supports a small curated set of source filters.
  const availableSources = scoreBySource ? Object.keys(scoreBySource) : [];
  const visibleSources = availableSources.filter((src) => src in SOURCE_LABELS && src !== 'full');

  // Resolve component scores and per-source signals for the active source filter
  const components = assessment.components ?? [];
  const activeSourceData = (activeSource !== 'full') ? scoreBySource?.[activeSource] : null;

  function getScore(comp) {
    if (!activeSourceData) return comp;
    const src = activeSourceData[comp.component_id];
    if (!src) return comp;
    return { ...comp, score: src.score, confidence: src.confidence };
  }

  function getSourceSignals(compId) {
    if (activeSourceData) return activeSourceData[compId]?.signals ?? [];
    // Full view: aggregate signals from all sources so every extracted signal is shown
    if (!scoreBySource) return null;
    const all = [];
    for (const srcData of Object.values(scoreBySource)) {
      const compData = srcData[compId];
      if (compData?.signals) all.push(...compData.signals);
    }
    return all.length > 0 ? all : null;
  }

  useEffect(() => {
    if (!openCompId) return;
    const el = compRefs.current?.[openCompId];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openCompId]);

  return (
    <div className={styles.root} aria-busy={translating ? 'true' : 'false'}>
      {translating && (
        <div className={styles.translateOverlay} role="status" aria-live="polite">
          <div className={styles.translateOverlayInner}>
            <div className={styles.spinner} aria-hidden="true" />
            <div className={styles.translateText}>{t('report.translating')}</div>
          </div>
        </div>
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

      {/* ── Source filter pills (only shown when score_by_source is present) ── */}
      {visibleSources.length > 0 && (
        <div className={styles.sourceFilter}>
          {['full', ...visibleSources].map((src) => (
            <button
              key={src}
              type="button"
              className={`${styles.sourceBtn} ${activeSource === src ? styles.sourceBtnActive : ''}`}
              onClick={() => setActiveSource(src)}
            >
              {SOURCE_LABELS[src] ?? src}
            </button>
          ))}
        </div>
      )}

      {/* ── Component pills ── */}
      <div className={styles.pills}>
        {components.map((c) => {
          const resolved = getScore(c);
          return (
            <div key={c.component_id} className={styles.pill}>
              <span>{ICONS[c.component_id]}</span>
              <span className={styles.pillName}>
                {t(`comp.${c.component_id}`) ?? c.component_id.replace(/_/g, ' ')}
              </span>
              <span className={styles.pillScore} style={{ color: scoreColor(resolved.score) }}>
                {scoreLabel(resolved.score, t)}
              </span>
            </div>
          );
        })}
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
          <ComponentCard
            key={c.component_id}
            comp={c}
            t={t}
            sourceSignals={getSourceSignals(c.component_id)}
            open={openCompId === c.component_id}
            evidenceOpen={openEvidenceCompId === c.component_id}
            onToggle={(e) => {
              const isOpen = e.currentTarget.open;
              setOpenCompId(isOpen ? c.component_id : null);
              if (!isOpen) setOpenEvidenceCompId((prev) => (prev === c.component_id ? null : prev));
            }}
            onEvidenceToggle={(e) => {
              const isOpen = e.currentTarget.open;
              setOpenEvidenceCompId(isOpen ? c.component_id : null);
            }}
            cardRef={(el) => {
              if (el) compRefs.current[c.component_id] = el;
            }}
          />
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
