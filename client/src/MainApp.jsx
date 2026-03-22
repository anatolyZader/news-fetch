import { useTodayReport } from './hooks/useAnalysis.js';
import { ReportView } from './components/ReportView.jsx';
import { ReportMarkdownView } from './components/ReportMarkdownView.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { EvidenceInput } from './components/EvidenceInput.jsx';
import { useAuth } from './context/AuthContext.jsx';
import styles from './App.module.css';

export function MainApp() {
  const { logout, authRequired } = useAuth();
  const { report, markdown, costUsd, initialReportLoadDone } = useTodayReport();

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerBrand}>
          <h1 className={styles.title}>Community Resilience</h1>
          <p className={styles.subtitle}>Home Front Command · Daily Assessment</p>
        </div>
        {authRequired && (
          <button type="button" className={styles.signOut} onClick={() => logout()}>
            Sign out
          </button>
        )}
      </header>

      <main className={styles.main}>
        <EvidenceInput />

        <section className={styles.reportSection} aria-labelledby="today-report-heading">
          <h2 id="today-report-heading" className={styles.reportSectionTitle}>
            Today&apos;s report
          </h2>
          <p className={styles.reportSectionHint}>Read-only · Latest assessment available for today</p>

          {!initialReportLoadDone && <p className={styles.reportLoading}>Loading report…</p>}

          {initialReportLoadDone && !report && (
            <div className={styles.reportEmpty}>
              No assessment is available yet for today. Generate one on the server (e.g. run the resilience analysis
              pipeline) and refresh this page.
            </div>
          )}

          {initialReportLoadDone && report && (
            <div className={styles.reportReadonlyFrame}>
              {markdown?.trim() ? (
                <ReportMarkdownView markdown={markdown} readOnly />
              ) : (
                <ReportView assessment={report} costUsd={costUsd} readOnly />
              )}
            </div>
          )}
        </section>

        {report && <ChatPanel />}
      </main>
    </div>
  );
}
