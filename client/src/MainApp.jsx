import { useEffect, useMemo, useRef, useState } from 'react';
import { useTodayReport } from './hooks/useAnalysis.js';
import { useTranslatedReport } from './hooks/useTranslatedReport.js';
import { ReportView } from './components/ReportView.jsx';
import { ReportMarkdownView } from './components/ReportMarkdownView.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { DocsPanel } from './components/DocsPanel.jsx';
import { ReportBuildPanel } from './components/ReportBuildPanel.jsx';
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
  const { report, markdown, scoreBySource, reportDate, initialReportLoadDone } = useTodayReport();
  const [activeTab, setActiveTab] = useState('report');
  const [activePoolTab, setActivePoolTab] = useState('naftali');
  const reportTopRef = useRef(null);
  const [openReportCompId, setOpenReportCompId] = useState(null);
  const [openReportEvidenceCompId, setOpenReportEvidenceCompId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [reportBuildOpen, setReportBuildOpen] = useState(false);
  const { t, lang } = useLanguage();
  const { displayReport, translating, translateError } = useTranslatedReport(report, lang);

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); // YYYY-MM-DD
  const isOutdated = reportDate && reportDate !== todayStr;

  const reportContents = useMemo(() => {
    const comps = displayReport?.components ?? [];
    return comps.map((c) => ({
      id: c.component_id,
      label: t(`comp.${c.component_id}`) ?? c.component_id.replace(/_/g, ' '),
    }));
  }, [displayReport, t]);

  useEffect(() => {
    if (activeTab !== 'report') setChatOpen(false);
  }, [activeTab]);

  function jumpToReportComponent(compId) {
    setOpenReportCompId((prev) => {
      const next = prev === compId ? null : compId;
      setOpenReportEvidenceCompId(next);
      return next;
    });
  }

  const TABS = [
    { id: 'report',      label: t('tab.report') },
    { id: 'municipalities', label: t('tab.municipalities') },
    { id: 'pools',       label: t('tab.pools') },
  ];

  const POOL_TABS = [
    { id: 'naftali',   label: t('tab.naftali') },
    { id: 'education', label: t('tab.education') },
  ];

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerBrand}>
          <h1 className={styles.title}>Vibes Witch</h1>
          <p className={styles.subtitle}>Home Front Command · Daily Assessment</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.docsButton} onClick={() => setReportBuildOpen(true)}>
            Write report
          </button>
          <button type="button" className={styles.docsButton} onClick={() => setDocsOpen(true)}>
            Docs
          </button>
          <LanguageSelector />
          {authRequired && (
            <button type="button" className={styles.signOut} onClick={() => logout()}>
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className={styles.main}>
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
            <div ref={reportTopRef} />
{!initialReportLoadDone && <p className={styles.reportLoading}>Loading report…</p>}

            {initialReportLoadDone && !report && (
              <div className={styles.reportEmpty}>
                No assessment is available yet. Generate one on the server and refresh this page.
              </div>
            )}

            {initialReportLoadDone && report && (
              <>
                <div className={styles.reportGrid}>
                  <aside className={styles.reportSidebar} aria-label="Report contents">
                    <div className={styles.reportSidebarList}>
                      {reportContents.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`${styles.reportSidebarItem} ${openReportCompId === c.id ? styles.reportSidebarItemActive : ''}`}
                          onClick={() => jumpToReportComponent(c.id)}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </aside>

                  <div className={styles.reportMainCol}>
                    {isOutdated && (
                      <div className={styles.reportOutdated}>
                        {t('report.outdated').replace('{date}', reportDate.split('-').reverse().join('-'))}
                      </div>
                    )}
                    <div className={styles.reportReadonlyFrame}>
                      <ReportView
                        assessment={displayReport}
                        scoreBySource={displayReport?.score_by_source ?? scoreBySource}
                        readOnly
                        translating={translating}
                        translateError={translateError}
                        openCompId={openReportCompId}
                        setOpenCompId={setOpenReportCompId}
                        openEvidenceCompId={openReportEvidenceCompId}
                        setOpenEvidenceCompId={setOpenReportEvidenceCompId}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {report && (
              <>
                <button
                  type="button"
                  className={styles.chatToggle}
                  onClick={() => setChatOpen((v) => !v)}
                  aria-label={chatOpen ? 'Close chat' : 'Open chat'}
                  title={chatOpen ? 'Close chat' : 'Open chat'}
                >
                  {chatOpen ? 'Close chat' : 'Chat'}
                </button>

                {chatOpen && (
                  <div className={styles.chatOverlay} role="dialog" aria-label="Chat">
                    <ChatPanel
                      reportScope={
                        openReportCompId
                          ? { type: 'component', id: openReportCompId, label: reportContents.find((c) => c.id === openReportCompId)?.label ?? openReportCompId }
                          : { type: 'all' }
                      }
                    />
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {activeTab === 'municipalities' && <MunicipalitiesTab />}

        {activeTab === 'pools' && (
          <>
            <nav className={styles.subTabs} aria-label="Pools">
              {POOL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`${styles.tab} ${styles.subTab} ${activePoolTab === tab.id ? styles.tabActive : ''}`}
                  onClick={() => setActivePoolTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {activePoolTab === 'naftali' && <NaftaliTab />}
            {activePoolTab === 'education' && <EducationTab />}
          </>
        )}
      </main>

      <DocsPanel open={docsOpen} onClose={() => setDocsOpen(false)} />
      <ReportBuildPanel open={reportBuildOpen} onClose={() => setReportBuildOpen(false)} />
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
