import { useState } from 'react';
import { useTodayReport } from './hooks/useAnalysis.js';
import { useTranslatedReport } from './hooks/useTranslatedReport.js';
import { ReportView } from './components/ReportView.jsx';
import { ReportMarkdownView } from './components/ReportMarkdownView.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { EvidenceInput } from './components/EvidenceInput.jsx';
import { SubmissionsTab } from './components/SubmissionsTab.jsx';
import { EducationTab } from './components/EducationTab.jsx';
import { MunicipalitiesTab } from './components/MunicipalitiesTab.jsx';
import { NaftaliTab } from './components/NaftaliTab.jsx';
import { LanguageProvider, useLanguage } from './context/LanguageContext.jsx';
import { LanguageSelector } from './components/LanguageSelector.jsx';
import { useAuth } from './context/AuthContext.jsx';
import styles from './App.module.css';

function AppShell() {
  const { logout, authRequired } = useAuth();
  const { report, markdown, costUsd, costBreakdown, scoreBySource, initialReportLoadDone } = useTodayReport();
  const [activeTab, setActiveTab] = useState('report');
  const { t, lang } = useLanguage();
  const { displayReport, translating, translateError } = useTranslatedReport(report, lang);

  const TABS = [
    { id: 'report',      label: t('tab.report') },
    { id: 'submissions', label: t('tab.submissions') },
    { id: 'education',      label: t('tab.education') },
    { id: 'municipalities', label: t('tab.municipalities') },
    { id: 'naftali',        label: t('tab.naftali') },
  ];

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerBrand}>
          <h1 className={styles.title}>Community Resilience</h1>
          <p className={styles.subtitle}>Home Front Command · Daily Assessment</p>
        </div>
        <div className={styles.headerActions}>
          <LanguageSelector />
          {authRequired && (
            <button type="button" className={styles.signOut} onClick={() => logout()}>
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <EvidenceInput />

        <nav className={styles.tabs} aria-label="Main sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'report' && (
          <section className={styles.reportSection} aria-labelledby="today-report-heading">
{!initialReportLoadDone && <p className={styles.reportLoading}>Loading report…</p>}

            {initialReportLoadDone && !report && (
              <div className={styles.reportEmpty}>
                No assessment is available yet for today. Generate one on the server and refresh this page.
              </div>
            )}

            {initialReportLoadDone && report && (
              <div className={styles.reportReadonlyFrame}>
                <ReportView assessment={displayReport} costUsd={costUsd} costBreakdown={costBreakdown} scoreBySource={displayReport?.score_by_source ?? scoreBySource} readOnly translating={translating} translateError={translateError} />
              </div>
            )}

            {report && <ChatPanel />}
          </section>
        )}

        {activeTab === 'submissions' && <SubmissionsTab />}

        {activeTab === 'education' && <EducationTab />}

        {activeTab === 'municipalities' && <MunicipalitiesTab />}

        {activeTab === 'naftali' && <NaftaliTab />}
      </main>
    </div>
  );
}

export function MainApp() {
  return (
    <LanguageProvider>
      <AppShell />
    </LanguageProvider>
  );
}
