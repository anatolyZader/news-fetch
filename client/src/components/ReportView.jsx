import styles from './ReportView.module.css';

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

function scoreLabel(s) {
  if (s <= 2) return 'Critical';
  if (s <= 4) return 'Weak';
  if (s <= 6) return 'Moderate';
  if (s <= 8) return 'Good';
  return 'Strong';
}

function ScoreBadge({ score }) {
  return (
    <span className={styles.badge} style={{ background: scoreColor(score) }}>
      {score}/10
    </span>
  );
}

function ComponentCard({ comp }) {
  const icon = ICONS[comp.component_id] ?? '•';
  const label = comp.component_id.replace(/_/g, ' ');

  return (
    <details className={styles.card}>
      <summary className={styles.cardHeader}>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.compName}>{label}</span>
        <ScoreBadge score={comp.score} />
        <span className={styles.confidence}>{comp.confidence}</span>
      </summary>
      <div className={styles.cardBody}>
        <p>{comp.narrative}</p>

        {comp.supporting_evidence?.length > 0 && (
          <div className={styles.evidence}>
            <strong>Positive signals</strong>
            <ul>{comp.supporting_evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}

        {comp.weakening_evidence?.length > 0 && (
          <div className={styles.evidence}>
            <strong>Concerns</strong>
            <ul>{comp.weakening_evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}

        {comp.missing_evidence && (
          <p className={styles.gaps}><em>Gaps: {comp.missing_evidence}</em></p>
        )}
      </div>
    </details>
  );
}

export function ReportView({ assessment, costUsd }) {
  const overall = assessment.overall_resilience_score;

  return (
    <div className={styles.root}>
      {/* ── Overall score ── */}
      <div className={styles.overallRow}>
        <div className={styles.overallScore} style={{ color: scoreColor(overall) }}>
          {overall}/10
        </div>
        <div>
          <div className={styles.overallLabel}>Overall Resilience — {scoreLabel(overall)}</div>
          <div className={styles.meta}>
            {assessment.date} · {assessment.total_articles_analyzed} articles
            {costUsd != null && ` · $${costUsd.toFixed(4)}`}
          </div>
        </div>
      </div>

      {/* ── Component score pills ── */}
      <div className={styles.pills}>
        {(assessment.components ?? []).map((c) => (
          <div key={c.component_id} className={styles.pill}>
            <span>{ICONS[c.component_id]}</span>
            <span className={styles.pillName}>{c.component_id.replace(/_/g, ' ')}</span>
            <span className={styles.pillScore} style={{ color: scoreColor(c.score) }}>
              {c.score}/10
            </span>
          </div>
        ))}
      </div>

      {/* ── Executive summary ── */}
      <section className={styles.section}>
        <h2>Executive Summary</h2>
        <p>{assessment.cross_component_synthesis}</p>
      </section>

      {/* ── Component cards ── */}
      <section className={styles.section}>
        <h2>Components</h2>
        {(assessment.components ?? []).map((c) => (
          <ComponentCard key={c.component_id} comp={c} />
        ))}
      </section>

      {/* ── Caveats ── */}
      {assessment.media_bias_caveats && (
        <section className={styles.section}>
          <h2>Methodological Caveats</h2>
          <p className={styles.muted}>{assessment.media_bias_caveats}</p>
        </section>
      )}
    </div>
  );
}
