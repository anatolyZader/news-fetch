import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Slide from '@mui/material/Slide';
import Alert from '@mui/material/Alert';
import { useTodayReport } from './hooks/useAnalysis.js';
import { useTranslatedReport } from './hooks/useTranslatedReport.js';
import { ReportView } from './components/ReportView.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { DocsPanel } from './components/DocsPanel.jsx';
import { ReportBuildPanel } from './components/ReportBuildPanel.jsx';
import { EducationTab } from './components/EducationTab.jsx';
import { MunicipalitiesTab } from './components/MunicipalitiesTab.jsx';
import { NaftaliTab } from './components/NaftaliTab.jsx';
import { useLanguage } from './context/LanguageContext.jsx';
import { LanguageSelector } from './components/LanguageSelector.jsx';
import { useAuth } from './context/AuthContext.jsx';
import {
  AppLayout,
  BrandHeader,
  ChatLauncher,
  PrimaryTab,
  ResizableFrame,
  SidebarItem,
} from './ui/index.js';
import { formatDate } from './lib/date.js';

function AppShell() {
  const { logout, authRequired } = useAuth();
  const { report, scoreBySource, reportDate, initialReportLoadDone } = useTodayReport();
  const [activeTab, setActiveTab] = useState('report');
  const [activePoolTab, setActivePoolTab] = useState('naftali');
  const reportTopRef = useRef(null);
  const [openReportCompId, setOpenReportCompId] = useState(null);
  const [openReportEvidenceCompId, setOpenReportEvidenceCompId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSize, setChatSize] = useState(() => {
    if (typeof window === 'undefined') return { w: 420, h: 420 };
    return { w: Math.min(420, window.innerWidth - 32), h: 420 };
  });
  const onChatSize = useCallback((next) => {
    if (typeof window === 'undefined') return;
    const maxW = window.innerWidth - 16;
    const maxH = window.innerHeight - 24;
    setChatSize({
      w: Math.max(280, Math.min(maxW, next.width)),
      h: Math.max(200, Math.min(maxH, next.height)),
    });
  }, []);

  const [docsOpen, setDocsOpen] = useState(false);
  const [reportBuildOpen, setReportBuildOpen] = useState(false);
  const { t, lang } = useLanguage();
  const { displayReport, translating, translateError } = useTranslatedReport(report, lang);

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
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

  const handleChatPanelClose = useCallback(() => {
    setChatOpen(false);
  }, []);

  function jumpToReportComponent(compId) {
    setOpenReportCompId((prev) => {
      const next = prev === compId ? null : compId;
      setOpenReportEvidenceCompId(next);
      return next;
    });
  }

  const TABS = [
    { id: 'report',         label: t('tab.report') },
    { id: 'municipalities', label: t('tab.municipalities') },
    { id: 'pools',          label: t('tab.pools') },
  ];

  const POOL_TABS = [
    { id: 'naftali',   label: t('tab.naftali') },
    { id: 'education', label: t('tab.education') },
  ];

  const headerButtonSx = (theme) => ({
    paddingTop: theme.spacing(0.5),
    paddingBottom: theme.spacing(0.5),
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
    fontSize: theme.typography.pill.fontSize,
    borderRadius: theme.custom.radius.sm,
    color: theme.palette.text.secondary,
    borderColor: theme.palette.divider,
    '&:hover': {
      color: theme.palette.text.primary,
      borderColor: theme.palette.divider,
      background: 'transparent',
    },
  });

  const header = (
    <>
      <BrandHeader title="Vibes Witch" subtitle="Community resilience · Daily Assessment" />
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ ml: 'auto', flexShrink: 0 }}>
        <Button variant="outlined" type="button" onClick={() => setReportBuildOpen(true)} sx={headerButtonSx}>
          Write report
        </Button>
        <Button variant="outlined" type="button" onClick={() => setDocsOpen(true)} sx={headerButtonSx}>
          Docs
        </Button>
        <LanguageSelector />
        {authRequired && (
          <Button variant="outlined" type="button" onClick={() => logout()} sx={headerButtonSx}>
            Sign out
          </Button>
        )}
      </Stack>
    </>
  );

  return (
    <AppLayout header={header}>
        <Stack
          component="nav"
          aria-label="Main sections"
          direction="row"
          sx={(theme) => ({ borderBottom: theme.custom.border.hairline })}
        >
          {TABS.map((tab) => (
            <PrimaryTab
              key={tab.id}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </PrimaryTab>
          ))}
        </Stack>

        {activeTab === 'report' && (
          <Stack
            component="section"
            aria-labelledby="today-report-heading"
            spacing={2}
          >
            <div ref={reportTopRef} />
            {!initialReportLoadDone && (
              <Typography variant="body2" color="text.secondary">
                Loading report…
              </Typography>
            )}

            {initialReportLoadDone && !report && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={(theme) => ({
                  paddingTop: theme.spacing(2),
                  paddingBottom: theme.spacing(2),
                  paddingLeft: theme.spacing(2.5),
                  paddingRight: theme.spacing(2.5),
                  background: theme.palette.background.paper,
                  border: `1px dashed ${theme.palette.divider}`,
                  borderRadius: theme.custom.radius.lg,
                })}
              >
                No assessment is available yet. Generate one on the server and refresh this page.
              </Typography>
            )}

            {initialReportLoadDone && report && (
              <Box
                sx={(theme) => ({
                  display: 'grid',
                  gridTemplateColumns: '220px minmax(0, 1fr)',
                  gap: theme.spacing(2),
                  alignItems: 'start',
                  [theme.breakpoints.down('md')]: { gridTemplateColumns: 'minmax(0, 1fr)' },
                })}
              >
                <Box
                  component="aside"
                  aria-label="Report contents"
                  sx={(theme) => ({
                    position: 'sticky',
                    top: theme.spacing(1.5),
                    alignSelf: 'start',
                    [theme.breakpoints.down('md')]: { display: 'none' },
                  })}
                >
                  <Stack spacing={0.5}>
                    {reportContents.map((c) => (
                      <SidebarItem
                        key={c.id}
                        active={openReportCompId === c.id}
                        onClick={() => jumpToReportComponent(c.id)}
                      >
                        {c.label}
                      </SidebarItem>
                    ))}
                  </Stack>
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  {isOutdated && (
                    <Alert
                      severity="warning"
                      variant="outlined"
                      sx={(theme) => ({ marginBottom: theme.spacing(1) })}
                    >
                      {t('report.outdated').replace('{date}', formatDate(reportDate))}
                    </Alert>
                  )}
                  <Box
                    sx={(theme) => ({
                      border: theme.custom.border.hairline,
                      borderRadius: theme.custom.radius.lg,
                      paddingTop: theme.spacing(3),
                      paddingBottom: theme.spacing(3),
                      paddingLeft: theme.spacing(3),
                      paddingRight: theme.spacing(3),
                      background: theme.palette.background.paper,
                      boxShadow: theme.custom.elevation.subtle,
                    })}
                  >
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
                  </Box>
                </Box>
              </Box>
            )}

            {report && (
              <>
                <ChatLauncher
                  open={chatOpen}
                  onClick={() => setChatOpen((v) => !v)}
                  openLabel="Close chat"
                  closedLabel="Chat"
                />

                <Slide direction="up" in={chatOpen} mountOnEnter unmountOnExit>
                  <Paper
                    role="dialog"
                    aria-label="Chat"
                    elevation={6}
                    sx={(theme) => ({
                      position: 'fixed',
                      right: theme.spacing(3),
                      bottom: theme.spacing(9.5),
                      width: chatSize.w,
                      height: chatSize.h,
                      zIndex: theme.zIndex.tooltip + 5,
                      borderRadius: theme.custom.radius.xl,
                      boxShadow: theme.custom.elevation.chat,
                      overflow: 'hidden',
                      pointerEvents: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      [theme.breakpoints.down('sm')]: {
                        right: theme.spacing(2),
                        bottom: theme.spacing(8),
                      },
                    })}
                  >
                    <ResizableFrame
                      width={chatSize.w}
                      height={chatSize.h}
                      onSize={onChatSize}
                      minWidth={280}
                      minHeight={200}
                      maxWidth={typeof window !== 'undefined' ? window.innerWidth - 16 : 2000}
                      maxHeight={typeof window !== 'undefined' ? window.innerHeight - 24 : 2000}
                      zIndex={2}
                    />
                    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                      <ChatPanel
                        reportScope={
                          openReportCompId
                            ? { type: 'component', id: openReportCompId, label: reportContents.find((c) => c.id === openReportCompId)?.label ?? openReportCompId }
                            : { type: 'all' }
                        }
                        onClose={handleChatPanelClose}
                      />
                    </Box>
                  </Paper>
                </Slide>
              </>
            )}
          </Stack>
        )}

        {activeTab === 'municipalities' && <MunicipalitiesTab />}

        {activeTab === 'pools' && (
          <>
            <Stack
              component="nav"
              direction="row"
              aria-label="Pools"
              sx={(theme) => ({
                borderBottom: theme.custom.border.hairline,
                marginTop: theme.spacing(-1.5),
              })}
            >
              {POOL_TABS.map((tab) => (
                <PrimaryTab
                  key={tab.id}
                  compact
                  active={activePoolTab === tab.id}
                  onClick={() => setActivePoolTab(tab.id)}
                >
                  {tab.label}
                </PrimaryTab>
              ))}
            </Stack>

            {activePoolTab === 'naftali' && <NaftaliTab />}
            {activePoolTab === 'education' && <EducationTab />}
          </>
        )}

      <DocsPanel open={docsOpen} onClose={() => setDocsOpen(false)} />
      <ReportBuildPanel open={reportBuildOpen} onClose={() => setReportBuildOpen(false)} />
    </AppLayout>
  );
}

export function MainApp() {
  return <AppShell />;
}
