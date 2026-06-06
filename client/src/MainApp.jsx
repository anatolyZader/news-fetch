import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Slide from '@mui/material/Slide';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useTheme, alpha } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useTodayReport } from './hooks/useAnalysis.js';
import { useMonitoringSummary } from './hooks/usePipelineStatus.js';
import { usePanelPopups } from './hooks/usePanelPopups.js';
import { useDisplayCapabilities } from './hooks/useDisplayCapabilities.js';
import { useTranslatedReport } from './hooks/useTranslatedReport.js';
import { getAnalystSiteUrl } from './lib/analystSiteUrl.js';
import { ReportView } from './components/ReportView.jsx';
import { PipelineStatusPanel } from './components/PipelineStatusPanel.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { DocsPanel } from './components/DocsPanel.jsx';
import { ReportBuildPanel } from './components/ReportBuildPanel.jsx';
import { SendEvidencePanel } from './components/SendEvidencePanel.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import { EducationTab } from './components/EducationTab.jsx';
import { MunicipalitiesTab } from './components/MunicipalitiesTab.jsx';
import { PboRegionalDailyReports } from './components/PboRegionalDailyReports.jsx';
import { NaftaliTab } from './components/NaftaliTab.jsx';
import { ReportBotManualReportsTab } from './components/ReportBotManualReportsTab.jsx';
import { VisitsTab } from './components/VisitsTab.jsx';
import { TrendsTab } from './components/TrendsTab.jsx';
import { SocialMediaTab } from './components/SocialMediaTab.jsx';
import { NewsTab } from './components/NewsTab.jsx';
import { RadioTab } from './components/RadioTab.jsx';
import { useLanguage } from './context/LanguageContext.jsx';
import { LanguageSelector } from './components/LanguageSelector.jsx';
import { useAuth } from './context/AuthContext.jsx';
import {
  AppLayout,
  BrandHeader,
  ChatLauncher,
  DataSourcesNav,
  PageHeader,
  PrimaryTab,
  ResizableFrame,
  SidebarItem,
  SiteFooter,
} from './ui/index.js';
import { formatDate } from './lib/date.js';

const LS_MAIN_TAB = 'vibes-witch:mainTab';
const LS_POOL_TAB = 'vibes-witch:poolTab';
const LS_PBO_TAB = 'vibes-witch:pboTab';
const LS_PBO_REGION = 'vibes-witch:pboRegion';
const LS_REPORT_SCOPE = 'vibes-witch:reportScope';
const MAIN_TAB_IDS = new Set(['report', 'pbo-reports', 'report-bot', 'visits', 'news', 'radio', 'pools', 'trends', 'social-media']);
const PBO_TAB_IDS = new Set(['local', 'regional']);
/** Northern PBO sub-regions (maps to divisions in business_modules/geo/data/regions.json; Galma ≈ Western Galilee / גלמ״ע). */
const PBO_REGION_IDS_ORDER = ['naftali', 'golan', 'baram', 'hiram', 'galma'];
const PBO_REGION_IDS = new Set(PBO_REGION_IDS_ORDER);

function normalizeNorthPboRegionFromUrl(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return PBO_REGION_IDS.has(s) ? s : '';
}

function normalizeMainTabSection(section) {
  if (
    section === 'municipalities' ||
    section === 'pbo-municipal' ||
    section === 'pbo-regional' ||
    section === 'pbo-district' ||
    section === 'pbo-reports'
  ) {
    return 'pbo-reports';
  }
  if (section === 'drift') return 'report';
  if (section === 'chatbot') return 'report-bot';
  return section;
}

function normalizePboSubFromSection(section, pboQuery) {
  if (pboQuery && PBO_TAB_IDS.has(pboQuery)) return pboQuery;
  if (section === 'pbo-municipal' || section === 'municipalities') return 'local';
  if (section === 'pbo-regional') return 'regional';
  if (section === 'pbo-district') return 'local';
  return '';
}
const POOL_TAB_IDS = new Set(['naftali', 'education']);
const REPORT_SCOPES = new Set(['national', 'north']);

const EMPTY_DEEP_LINK = { section: '', pool: '', component: '', pboSub: '', pboRegion: '' };

function parsePboReportsHashSuffix(rest, existingPboSub) {
  let pboSub = existingPboSub;
  let pboRegion = '';
  const match = /^(local|regional)(?:-([\w-]+))?$/i.exec(rest);
  if (match && !pboSub) {
    const sub = String(match[1] ?? '').trim().toLowerCase();
    if (PBO_TAB_IDS.has(sub)) pboSub = sub;
  }
  if (match?.[2]) {
    const region = normalizeNorthPboRegionFromUrl(match[2]);
    if (region) pboRegion = region;
  } else if (!match && !pboSub) {
    const restTab = String(rest).trim().toLowerCase();
    if (PBO_TAB_IDS.has(restTab)) pboSub = restTab;
  }
  return { pboSub, pboRegion };
}

function parseHashDeepLink(hash) {
  if (hash.startsWith('pools-')) {
    return { section: 'pools', pool: '', pboSub: '', pboRegion: '' };
  }
  if (hash.startsWith('pbo-reports-')) {
    return { section: 'pbo-reports', pool: '', ...parsePboReportsHashSuffix(hash.slice('pbo-reports-'.length), '') };
  }
  if (hash === 'report-bot' || hash === 'chatbot') {
    return { section: 'report-bot', pool: '', pboSub: '', pboRegion: '' };
  }
  return { section: hash.split('-')[0] || '', pool: '', pboSub: '', pboRegion: '' };
}

function readDeepLink() {
  const browserWindow = globalThis.window;
  if (!browserWindow) {
    return EMPTY_DEEP_LINK;
  }
  const params = new URLSearchParams(browserWindow.location.search);
  let section = params.get('section') || '';
  const rawPbo = params.get('pbo');
  let pboSub =
    rawPbo && PBO_TAB_IDS.has(String(rawPbo).trim().toLowerCase())
      ? String(rawPbo).trim().toLowerCase()
      : '';
  let pboRegion = normalizeNorthPboRegionFromUrl(params.get('pbo_region') || '');
  const hash = browserWindow.location.hash.replace(/^#/, '');
  if (!section && hash) {
    const fromHash = parseHashDeepLink(hash);
    section = fromHash.section;
    if (!pboSub && fromHash.pboSub) pboSub = fromHash.pboSub;
    if (fromHash.pboRegion) pboRegion = fromHash.pboRegion;
  }
  const pool =
    params.get('pool') || (hash.startsWith('pools-') ? hash.replace('pools-', '') : '');
  return {
    section,
    pool,
    component: params.get('component') || '',
    pboSub,
    pboRegion,
  };
}

function readMainTab() {
  const { section } = readDeepLink();
  const fromLink = normalizeMainTabSection(section);
  if (MAIN_TAB_IDS.has(fromLink)) return fromLink;
  if (typeof localStorage === 'undefined') return 'report';
  try {
    const v = localStorage.getItem(LS_MAIN_TAB);
    const fromStore = normalizeMainTabSection(v ?? '');
    if (fromStore && MAIN_TAB_IDS.has(fromStore)) return fromStore;
  } catch { /* private mode or quota */ }
  return 'report';
}

function readPoolTab() {
  const { section, pool } = readDeepLink();
  if (section === 'pools' && POOL_TAB_IDS.has(pool)) return pool;
  if (typeof localStorage === 'undefined') return 'naftali';
  try {
    const v = localStorage.getItem(LS_POOL_TAB);
    if (v && POOL_TAB_IDS.has(v)) return v;
  } catch { /* */ }
  return 'naftali';
}

function readPboTab() {
  const { section, pboSub } = readDeepLink();
  const fromUrl = normalizePboSubFromSection(section, pboSub);
  if (fromUrl) return fromUrl;
  if (typeof localStorage === 'undefined') return 'local';
  try {
    const v = localStorage.getItem(LS_PBO_TAB);
    if (v && PBO_TAB_IDS.has(v)) return v;
    const legacyMain = localStorage.getItem(LS_MAIN_TAB);
    if (legacyMain === 'pbo-regional') return 'regional';
    if (legacyMain === 'pbo-municipal') return 'local';
  } catch { /* */ }
  return 'local';
}

function readPboRegionTab() {
  const { pboRegion } = readDeepLink();
  if (pboRegion) return pboRegion;
  if (typeof localStorage === 'undefined') return PBO_REGION_IDS_ORDER[0];
  try {
    const v = normalizeNorthPboRegionFromUrl(localStorage.getItem(LS_PBO_REGION));
    if (v) return v;
  } catch { /* */ }
  return PBO_REGION_IDS_ORDER[0];
}

function headerChromeRadius(th) {
  return `${th.custom.radius.section}px`;
}

function readReportScope() {
  if (typeof localStorage === 'undefined') return 'national';
  try {
    const v = localStorage.getItem(LS_REPORT_SCOPE);
    if (v && REPORT_SCOPES.has(v)) return v;
  } catch { /* */ }
  return 'national';
}

function AppShell() {
  const { logout, authRequired, user } = useAuth();
  const { canViewAnalyst } = useDisplayCapabilities();
  const analystSiteUrl = getAnalystSiteUrl();
  const [reportScope, setReportScope] = useState(() => readReportScope());
  const {
    report,
    scoreBySource,
    reportDate,
    initialReportLoadDone,
    reportMissingHint,
    attentionItems,
  } = useTodayReport(reportScope);
  const [activeTab, setActiveTab] = useState(() => readMainTab());
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const {
    data: monitoringSummary,
    loading: monitoringLoading,
    error: monitoringError,
  } = useMonitoringSummary({
    scope: reportScope,
    date: reportDate || todayStr,
    enabled: canViewAnalyst && activeTab === 'report',
  });
  const [activePoolTab, setActivePoolTab] = useState(() => readPoolTab());
  const [activePboTab, setActivePboTab] = useState(() => readPboTab());
  const [activePboRegionTab, setActivePboRegionTab] = useState(() => readPboRegionTab());
  const reportTopRef = useRef(null);
  const [openReportCompId, setOpenReportCompId] = useState(() => readDeepLink().component || null);
  const [openReportEvidenceCompId, setOpenReportEvidenceCompId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSize, setChatSize] = useState(() => {
    const browserWindow = globalThis.window;
    if (!browserWindow) return { w: 420, h: 420 };
    return { w: Math.min(420, browserWindow.innerWidth - 32), h: 420 };
  });
  const onChatSize = useCallback((next) => {
    const browserWindow = globalThis.window;
    if (!browserWindow) return;
    const maxW = browserWindow.innerWidth - 16;
    const maxH = browserWindow.innerHeight - 24;
    setChatSize({
      w: Math.max(280, Math.min(maxW, next.width)),
      h: Math.max(200, Math.min(maxH, next.height)),
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_MAIN_TAB, activeTab);
    } catch { /* */ }
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_POOL_TAB, activePoolTab);
    } catch { /* */ }
  }, [activePoolTab]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PBO_TAB, activePboTab);
    } catch { /* */ }
  }, [activePboTab]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PBO_REGION, activePboRegionTab);
    } catch { /* */ }
  }, [activePboRegionTab]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_REPORT_SCOPE, reportScope);
    } catch { /* */ }
    queueMicrotask(() => {
      setOpenReportCompId(null);
      setOpenReportEvidenceCompId(null);
    });
  }, [reportScope]);

  const [docsOpen, setDocsOpen] = useState(false);
  const [docsInitialSlug, setDocsInitialSlug] = useState('');
  const [reportBuildOpen, setReportBuildOpen] = useState(false);
  const [sendEvidenceOpen, setSendEvidenceOpen] = useState(false);
  const [evidenceNotice, setEvidenceNotice] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState(null);
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const closeMoreMenu = useCallback(() => setMoreMenuAnchor(null), []);
  const goToAssessment = useCallback(() => {
    setActiveTab('report');
    reportTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const closeDocs = useCallback(() => {
    setDocsOpen(false);
    setDocsInitialSlug('');
  }, []);
  const openDocsRef = useRef(() => {});
  const { open: openPanelPopup, isOpen: isPanelPopupOpen } = usePanelPopups({
    onEvidenceSubmissionComplete: (notice) => setEvidenceNotice({ ...notice, open: true }),
    onOpenDocs: (slug) => openDocsRef.current(slug ?? ''),
  });
  const openDocs = useCallback((slug = '') => {
    if (isDesktop) {
      openPanelPopup('docs', { slug });
      return;
    }
    setDocsInitialSlug(slug);
    setDocsOpen(true);
  }, [isDesktop, openPanelPopup]);
  useEffect(() => {
    openDocsRef.current = openDocs;
  }, [openDocs]);
  const openSettings = useCallback(() => {
    if (isDesktop) {
      openPanelPopup('settings');
      return;
    }
    setSettingsOpen(true);
  }, [isDesktop, openPanelPopup]);
  const openReportBuild = useCallback(() => {
    if (isDesktop) {
      openPanelPopup('report-build');
      return;
    }
    setReportBuildOpen(true);
  }, [isDesktop, openPanelPopup]);
  const dismissReportBuild = useCallback(() => {
    setReportBuildOpen(false);
  }, []);
  const openSendEvidence = useCallback(() => {
    if (isDesktop) {
      openPanelPopup('send-evidence');
      return;
    }
    setSendEvidenceOpen(true);
  }, [isDesktop, openPanelPopup]);
  const dismissSendEvidence = useCallback(() => {
    setSendEvidenceOpen(false);
  }, []);
  const dismissSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const { t, lang } = useLanguage();
  const { displayReport, translating, translateError } = useTranslatedReport(report, lang);

  useEffect(() => {
    const applyDeepLink = () => {
      const { section, pool, component, pboSub, pboRegion } = readDeepLink();
      const mainSection = normalizeMainTabSection(section);
      if (MAIN_TAB_IDS.has(mainSection)) setActiveTab(mainSection);
      if (section === 'pools' && POOL_TAB_IDS.has(pool)) setActivePoolTab(pool);
      const pboFromUrl = normalizePboSubFromSection(section, pboSub);
      if (mainSection === 'pbo-reports' && pboFromUrl) setActivePboTab(pboFromUrl);
      if (mainSection === 'pbo-reports' && pboRegion && PBO_REGION_IDS.has(pboRegion)) {
        setActivePboRegionTab(pboRegion);
      }
      if (section === 'report' && component) {
        setOpenReportCompId(component);
        setOpenReportEvidenceCompId(null);
      }
    };
    applyDeepLink();
    globalThis.window?.addEventListener('popstate', applyDeepLink);
    return () => globalThis.window?.removeEventListener('popstate', applyDeepLink);
  }, []);

  const isOutdated = reportDate && reportDate !== todayStr;

  const reportContents = useMemo(() => {
    const comps = displayReport?.components ?? [];
    return comps.map((c) => ({
      id: c.component_id,
      label: t(`comp.${c.component_id}`) ?? c.component_id.replaceAll('_', ' '),
    }));
  }, [displayReport, t]);

  const chatReportScope = useMemo(() => {
    if (activeTab === 'report' && openReportCompId) {
      return {
        type: 'component',
        id: openReportCompId,
        label: reportContents.find((c) => c.id === openReportCompId)?.label ?? openReportCompId,
      };
    }
    return { type: 'all' };
  }, [activeTab, openReportCompId, reportContents]);

  const handleChatPanelClose = useCallback(() => {
    setChatOpen(false);
  }, []);
  const openChat = useCallback(() => {
    if (isDesktop) {
      openPanelPopup('chat', { reportScope: chatReportScope, reportGeoScope: reportScope });
      return;
    }
    setChatOpen(true);
  }, [isDesktop, openPanelPopup, chatReportScope, reportScope]);
  const chatPopupOpen = isDesktop && isPanelPopupOpen('chat');

  function jumpToReportComponent(compId) {
    setOpenReportCompId((prev) => (prev === compId ? null : compId));
    // Sidebar jump should show narrative + top of the card, not the nested evidence list.
    setOpenReportEvidenceCompId(null);
  }

  function openReportComponent(compId) {
    if (!compId) return;
    setOpenReportCompId(compId);
    setOpenReportEvidenceCompId(null);
  }

  const SOURCE_TABS = [
    { id: 'pbo-reports', label: t('tab.pboReports') },
    { id: 'report-bot', label: t('tab.reportBot') },
    { id: 'visits', label: t('tab.visits') },
    { id: 'news', label: t('tab.news') },
    { id: 'radio', label: t('tab.radio') },
    { id: 'social-media', label: t('tab.socialMedia') },
    { id: 'pools', label: t('tab.pools') },
    { id: 'trends', label: t('tab.trends') },
  ];

  const isOnAssessment = activeTab === 'report';

  const PBO_TABS = [
    { id: 'local',    label: t('tab.pboLocal') },
    { id: 'regional', label: t('tab.pboRegional') },
  ];

  const PBO_REGION_TABS = PBO_REGION_IDS_ORDER.map((id) => ({
    id,
    label: t(`pbo.region.${id}`),
  }));

  const POOL_TABS = [
    { id: 'naftali',   label: t('tab.naftali') },
    { id: 'education', label: t('tab.education') },
  ];

  const headerButtonSx = (th) => ({
    minHeight: th.spacing(4.5),
    paddingTop: th.spacing(0.75),
    paddingBottom: th.spacing(0.75),
    paddingLeft: th.spacing(1.25),
    paddingRight: th.spacing(1.25),
    fontSize: th.typography.pill.fontSize,
    borderRadius: headerChromeRadius(th),
    color: th.palette.primary.dark,
    borderColor: alpha(th.palette.primary.main, 0.45),
    backgroundColor: alpha(th.palette.background.paper, 0.9),
    '&:hover': {
      color: th.palette.primary.dark,
      borderColor: th.palette.primary.main,
      backgroundColor: th.custom.surface.roseWash,
    },
  });

  const moreIconButtonSx = (th) => ({
    border: `1px solid ${th.palette.divider}`,
    borderRadius: headerChromeRadius(th),
    width: th.spacing(4.5),
    height: th.spacing(4.5),
    color: th.palette.text.secondary,
    padding: 0,
    '&:hover': {
      color: th.palette.text.primary,
      borderColor: th.palette.divider,
      background: th.palette.action.hover,
    },
  });

  const header = (
    <>
      <BrandHeader
        title="Vibes Witch"
        subtitle="Community resilience · Daily Assessment"
        logoSrc="/logo_srulik_1_no_text.png"
        logoAlt=""
        onHomeClick={goToAssessment}
        homeAriaLabel={t('app.goToDailyAssessment')}
      />
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.75}
        sx={{ ml: 'auto', flexShrink: 0, flexWrap: { xs: 'wrap', md: 'nowrap' } }}
      >
        <Button
          variant="outlined"
          size="small"
          type="button"
          onClick={openReportBuild}
          aria-pressed={isDesktop ? isPanelPopupOpen('report-build') : reportBuildOpen}
          sx={headerButtonSx}
        >
          {t('app.writeReport')}
        </Button>
        {isDesktop && (
          <Button
            variant="outlined"
            size="small"
            type="button"
            onClick={openSendEvidence}
            aria-pressed={isPanelPopupOpen('send-evidence')}
            sx={headerButtonSx}
          >
            {t('app.sendEvidence')}
          </Button>
        )}
        <IconButton
          id="header-more-button"
          type="button"
          size="small"
          onClick={(e) => setMoreMenuAnchor(e.currentTarget)}
          aria-label={t('app.moreMenu')}
          aria-controls={moreMenuAnchor ? 'header-more-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={moreMenuAnchor ? 'true' : 'false'}
          sx={moreIconButtonSx}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu
          id="header-more-menu"
          anchorEl={moreMenuAnchor}
          open={Boolean(moreMenuAnchor)}
          onClose={closeMoreMenu}
          slotProps={{ list: { 'aria-labelledby': 'header-more-button' } }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {!isDesktop && (
            <MenuItem
              onClick={() => {
                openSendEvidence();
                closeMoreMenu();
              }}
            >
              {t('app.sendEvidence')}
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              openDocs();
              closeMoreMenu();
            }}
          >
            {t('app.docs')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              openSettings();
              closeMoreMenu();
            }}
          >
            {t('app.settings')}
          </MenuItem>
          {user && canViewAnalyst && (
            <MenuItem
              component="a"
              href={analystSiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMoreMenu}
            >
              {t('app.analystView')}
            </MenuItem>
          )}
          {authRequired && (
            <MenuItem
              onClick={() => {
                logout();
                closeMoreMenu();
              }}
            >
              {t('settings.signOut')}
            </MenuItem>
          )}
        </Menu>
        {translating && (
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            role="status"
            aria-live="polite"
            sx={(theme) => ({
              paddingTop: theme.spacing(0.5),
              paddingBottom: theme.spacing(0.5),
              paddingLeft: theme.spacing(1),
              paddingRight: theme.spacing(1),
              borderRadius: `${theme.custom.radius.section}px`,
              background: theme.palette.background.paper,
              border: theme.custom.border.hairline,
              boxShadow: theme.custom.elevation.hover,
            })}
          >
            <CircularProgress size={20} thickness={4} />
            <Typography variant="cardTitle" sx={{ lineHeight: 1.2 }}>
              {t('report.translating')}
            </Typography>
          </Stack>
        )}
        <LanguageSelector />
      </Stack>
    </>
  );

  return (
    <AppLayout
      header={header}
      footer={(
        <SiteFooter
          onGoToAssessment={goToAssessment}
          onSendEvidence={openSendEvidence}
          onNavigateTab={setActiveTab}
          onOpenDocs={openDocs}
          onOpenSettings={openSettings}
          onSignOut={logout}
          authRequired={authRequired}
          user={user}
        />
      )}
    >
        <DataSourcesNav
          isOnAssessment={isOnAssessment}
          activeSourceId={activeTab}
          sources={SOURCE_TABS}
          onSelectSource={setActiveTab}
          onGoToAssessment={goToAssessment}
        />

        {activeTab === 'report' && (
          <Stack
            component="section"
            aria-label={t('nav.dailyAssessment')}
            spacing={2}
          >
            <div ref={reportTopRef} />
            <PageHeader
              title={t('nav.dailyAssessment')}
              action={(
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1,
                  }}
                >
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={reportScope}
                    onChange={(_, next) => {
                      if (next) setReportScope(next);
                    }}
                    aria-label={t('report.scope.label')}
                  >
                    <ToggleButton value="national">{t('report.scope.national')}</ToggleButton>
                    <ToggleButton value="north">{t('report.scope.north')}</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              )}
            />

            {!initialReportLoadDone && (
              <Typography variant="body2" color="text.secondary">
                {t('app.reportLoading')}
              </Typography>
            )}

            {initialReportLoadDone && !report && reportMissingHint === 'north_requires_assess_signals' && (
              <Alert severity="info" variant="outlined" sx={(theme) => ({ marginBottom: theme.spacing(1) })}>
                {t('app.northReportMissingHint')}
              </Alert>
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
                  borderRadius: `${theme.custom.radius.section}px`,
                })}
              >
                {t('app.noReportYet')}
              </Typography>
            )}

            {initialReportLoadDone && report && (
              <Stack spacing={2}>
                {canViewAnalyst && (
                  <PipelineStatusPanel
                    data={monitoringSummary}
                    loading={monitoringLoading}
                    error={monitoringError}
                    defaultOpen={false}
                  />
                )}
              <Box
                sx={(theme) => ({
                  display: 'grid',
                  gridTemplateColumns: 'clamp(240px, 18vw, 280px) minmax(0, 1fr)',
                  gap: theme.spacing(2),
                  alignItems: 'start',
                  [theme.breakpoints.down('md')]: { gridTemplateColumns: 'minmax(0, 1fr)' },
                })}
              >
                <Box
                  component="aside"
                  dir={lang === 'he' ? 'rtl' : 'ltr'}
                  aria-label={t('app.ariaReportContents')}
                  sx={(theme) => ({
                    position: 'sticky',
                    top: theme.spacing(1.5),
                    alignSelf: 'start',
                    border: theme.custom.border.hairline,
                    borderRadius: `${theme.custom.radius.section}px`,
                    background: theme.palette.background.paper,
                    boxShadow: theme.custom.elevation.subtle,
                    overflow: 'hidden',
                    [theme.breakpoints.down('md')]: { display: 'none' },
                  })}
                >
                  <Stack spacing={0}>
                    {reportContents.map((c, index) => (
                      <SidebarItem
                        key={c.id}
                        grouped
                        isLast={index === reportContents.length - 1}
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
                      borderRadius: `${theme.custom.radius.section}px`,
                      overflow: 'hidden',
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
                      displayTier="operator"
                      readOnly
                      translating={translating}
                      translateError={translateError}
                      reportDate={reportDate}
                      reportScope={reportScope}
                      attentionItems={attentionItems ?? []}
                      onJumpToComponent={openReportComponent}
                      openCompId={openReportCompId}
                      setOpenCompId={setOpenReportCompId}
                      openEvidenceCompId={openReportEvidenceCompId}
                      setOpenEvidenceCompId={setOpenReportEvidenceCompId}
                    />
                  </Box>
                </Box>
              </Box>
              </Stack>
            )}
          </Stack>
        )}

        {activeTab === 'pbo-reports' && (
          <>
            <Stack
              component="nav"
              direction="row"
              aria-label={t('tab.pboReports')}
              sx={(theme) => ({
                borderBottom: theme.custom.border.hairline,
              })}
            >
              {PBO_TABS.map((tab) => (
                <PrimaryTab
                  key={tab.id}
                  compact
                  active={activePboTab === tab.id}
                  onClick={() => setActivePboTab(tab.id)}
                >
                  {tab.label}
                </PrimaryTab>
              ))}
            </Stack>

            {activePboTab === 'local' && <MunicipalitiesTab />}
            {activePboTab === 'regional' && (
              <>
                <Stack
                  component="nav"
                  direction="row"
                  aria-label={t('app.ariaPboNorthRegions')}
                  sx={(theme) => ({
                    borderBottom: theme.custom.border.hairline,
                    flexWrap: 'wrap',
                    marginTop: theme.spacing(-0.5),
                  })}
                >
                  {PBO_REGION_TABS.map((tab) => (
                    <PrimaryTab
                      key={tab.id}
                      compact
                      active={activePboRegionTab === tab.id}
                      onClick={() => setActivePboRegionTab(tab.id)}
                    >
                      {tab.label}
                    </PrimaryTab>
                  ))}
                </Stack>
                <PboRegionalDailyReports
                  regionId={activePboRegionTab}
                  showHistoricalSearch={canViewAnalyst}
                />
              </>
            )}
          </>
        )}

        {activeTab === 'report-bot' && <ReportBotManualReportsTab />}

        {activeTab === 'visits' && <VisitsTab />}

        {activeTab === 'news' && <NewsTab />}

        {activeTab === 'radio' && <RadioTab />}

        {activeTab === 'social-media' && <SocialMediaTab />}

        {activeTab === 'trends' && <TrendsTab />}

        {activeTab === 'pools' && (
          <>
            <Stack
              component="nav"
              direction="row"
              aria-label={t('tab.pools')}
              sx={(theme) => ({
                borderBottom: theme.custom.border.hairline,
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

      {!chatPopupOpen && !chatOpen && (
        <ChatLauncher
          open={false}
          onClick={openChat}
          closedLabel={t('chat.launcherWhenClosed')}
        />
      )}

      {!isDesktop && (
      <Slide direction="up" in={chatOpen} mountOnEnter unmountOnExit>
        <Paper
          role="dialog"
          aria-label={t('chat.ariaDialog')}
          elevation={6}
          sx={(theme) => ({
            position: 'fixed',
            right: theme.spacing(3),
            bottom: theme.spacing(7),
            width: chatSize.w,
            height: chatSize.h,
            zIndex: theme.zIndex.tooltip + 5,
            borderRadius: `${theme.custom.radius.section}px`,
            border: theme.custom.border.hairline,
            boxShadow: theme.custom.elevation.chat,
            overflow: 'hidden',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            [theme.breakpoints.down('sm')]: {
              right: theme.spacing(2),
              bottom: theme.spacing(6),
            },
          })}
        >
          <ResizableFrame
            width={chatSize.w}
            height={chatSize.h}
            onSize={onChatSize}
            minWidth={280}
            minHeight={200}
            maxWidth={globalThis.window ? globalThis.window.innerWidth - 16 : 2000}
            maxHeight={globalThis.window ? globalThis.window.innerHeight - 24 : 2000}
            zIndex={2}
          />
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <ChatPanel
              reportScope={chatReportScope}
              reportGeoScope={reportScope}
              onClose={handleChatPanelClose}
            />
          </Box>
        </Paper>
      </Slide>
      )}

      {!isDesktop && (
        <DocsPanel open={docsOpen} initialSlug={docsInitialSlug || undefined} onClose={closeDocs} />
      )}
      {!isDesktop && (
        <>
          <ReportBuildPanel
            open={reportBuildOpen}
            onClose={dismissReportBuild}
          />
          <SendEvidencePanel
            open={sendEvidenceOpen}
            onClose={dismissSendEvidence}
            onSubmissionComplete={(notice) => setEvidenceNotice({ ...notice, open: true })}
          />
          <SettingsPanel
            open={settingsOpen}
            onClose={dismissSettings}
            onOpenDocs={() => {
              dismissSettings();
              openDocs();
            }}
          />
        </>
      )}
      <Snackbar
        open={Boolean(evidenceNotice?.open)}
        autoHideDuration={8000}
        onClose={() => setEvidenceNotice((current) => (current ? { ...current, open: false } : current))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: '16px !important' }}
      >
        <Alert
          severity={evidenceNotice?.severity ?? 'info'}
          variant="filled"
          onClose={() => setEvidenceNotice((current) => (current ? { ...current, open: false } : current))}
        >
          {evidenceNotice?.message ?? ''}
        </Alert>
      </Snackbar>
    </AppLayout>
  );
}

export function MainApp() {
  return <AppShell />;
}
