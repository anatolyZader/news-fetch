import { useAnalysis } from './hooks/useAnalysis.js';
import { AnalyzeButton } from './components/AnalyzeButton.jsx';
import { ProgressFeed } from './components/ProgressFeed.jsx';
import { ReportView } from './components/ReportView.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { useAuth } from './context/AuthContext.jsx';
import styles from './App.module.css';

export function MainApp() {
  const { logout, authRequired } = useAuth();
  const { status, progress, report, error, costUsd, analyze } = useAnalysis();

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1 className={styles.title}>Community Resilience</h1>
        <span className={styles.subtitle}>Home Front Command · Daily Assessment</span>
        {authRequired && (
          <button type="button" className={styles.signOut} onClick={() => logout()}>
            Sign out
          </button>
        )}
      </header>

      <main className={styles.main}>
        <div className={styles.actionRow}>
          <AnalyzeButton onClick={analyze} disabled={status === 'running'} />
          {status === 'done' && report && (
            <span className={styles.tag}>
              {report.date} · {report.overall_resilience_score}/10
            </span>
          )}
        </div>

        {status === 'running' && <ProgressFeed messages={progress} />}

        {status === 'error' && error && <div className={styles.error}>{error}</div>}

        {status === 'done' && report && (
          <>
            <ReportView assessment={report} costUsd={costUsd} />
            <ChatPanel />
          </>
        )}
      </main>
    </div>
  );
}
