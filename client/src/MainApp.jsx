import PropTypes from 'prop-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import ListSubheader from '@mui/material/ListSubheader';
import Paper from '@mui/material/Paper';
import Slide from '@mui/material/Slide';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import CircularProgress from '@mui/material/CircularProgress';
import { useTheme, alpha } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useTodayReport, useReportEditions } from './hooks/useAnalysis.js';
import { usePanelPopups } from './hooks/usePanelPopups.js';
import { useDisplayCapabilities } from './hooks/useDisplayCapabilities.js';
import { useTranslatedReport } from './hooks/useTranslatedReport.js';
import { getAnalystSiteUrl } from './lib/analystSiteUrl.js';
import { formatDate } from './lib/date.js';
import { formatTemplate } from './lib/i18nFormat.js';
import { editionsMatch } from './lib/reportEditionFormat.js';
import { ReportView } from './components/ReportView.jsx';
import { ReportContentsMobileNav } from './components/ReportContentsMobileNav.jsx';
import { MobileDailyAssessmentCard } from './components/MobileDailyAssessmentCard.jsx';
import { DailyAssessmentControls } from './components/DailyAssessmentControls.jsx';
import { CrisisBudgetPanel } from './components/CrisisBudgetPanel.jsx';
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
import { LanguageSelector, LANGUAGE_CODES, LANGUAGE_LABELS } from './components/LanguageSelector.jsx';
import { LocaleStatusBanner } from './components/LocaleStatusBanner.jsx';
import { useAuth } from './context/AuthContext.jsx';
import {
  AppLayout,
  BrandHeader,
  ChatLauncher,
  DataSourcesNav,
  MobileAppBar,
  PageHeader,
  PrimaryTab,
  ResizableFrame,
  SidebarItem,
  SiteFooter,
  mobileFlatReportShellSx,
} from './ui/index.js';
import { useVisualViewportInset } from './hooks/useVisualViewportInset.js';

const LS_MAIN_TAB = 'vibes-witch:mainTab';
const LS_POOL_TAB = 'vibes-witch:poolTab';
const LS_PBO_TAB = 'vibes-witch:pboTab';
const LS_PBO_REGION = 'vibes-witch:pboRegion';
const LS_REPORT_SCOPE = 'vibes-witch:reportScope';
const LS_REPORT_EDITION = 'vibes-witch:reportEdition';
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

function headerButtonSx(th) {
  return {
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
  };
}

function moreIconButtonSx(th) {
  return {
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
  };
}

function readReportScope() {
  if (typeof localStorage === 'undefined') return 'national';
  try {
    const v = localStorage.getItem(LS_REPORT_SCOPE);
    if (v && REPORT_SCOPES.has(v)) return v;
  } catch { /* */ }
  return 'national';
}

/** @returns {{ date: string, run_id?: string | null } | null} */
function readStoredReportEdition(scope) {
  if (typeof localStorage === 'undefined' || !scope) return null;
  try {
    const raw = localStorage.getItem(LS_REPORT_EDITION);
    if (!raw) return null;
    const map = JSON.parse(raw);
    const entry = map?.[scope];
    if (!entry?.date || typeof entry.date !== 'string') return null;
    return { date: entry.date, run_id: entry.run_id ?? null };
  } catch { /* */ }
  return null;
}

/** @param {string} scope @param {{ date: string, run_id?: string | null } | null} edition */
function writeStoredReportEdition(scope, edition) {
  if (typeof localStorage === 'undefined' || !scope) return;
  try {
    const raw = localStorage.getItem(LS_REPORT_EDITION);
    const map = raw && typeof raw === 'string' ? JSON.parse(raw) : {};
    if (edition?.date) {
      map[scope] = { date: edition.date, run_id: edition.run_id ?? null };
    } else {
      delete map[scope];
    }
    localStorage.setItem(LS_REPORT_EDITION, JSON.stringify(map));
  } catch { /* */ }
}

function openResponsivePanel(isDesktop, openPanelPopup, panelKey, setMobileOpen, opts) {
  if (isDesktop) {
    openPanelPopup(panelKey, opts);
    return;
  }
  setMobileOpen(true);
}

function DailyAssessmentLoadStatus({
  initialReportLoadDone,
  reportLoadError,
  report,
  reportMissingHint,
  t,
}) {
  if (!initialReportLoadDone) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('app.reportLoading')}
      </Typography>
    );
  }
  if (reportLoadError) {
    return (
      <Alert severity="warning" variant="outlined" sx={(theme) => ({ marginBottom: theme.spacing(1) })}>
        {reportLoadError}
      </Alert>
    );
  }
  if (!report && (reportMissingHint === 'regional_requires_assess_signals'
    || reportMissingHint === 'north_requires_assess_signals')) {
    return (
      <Alert severity="info" variant="outlined" sx={(theme) => ({ marginBottom: theme.spacing(1) })}>
        {t('app.northReportMissingHint')}
      </Alert>
    );
  }
  if (!report && !reportMissingHint) {
    return (
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
    );
  }
  return null;
}

function HeaderMoreMenu({
  isDesktop,
  isCompact,
  moreMenuAnchor,
  closeMoreMenu,
  openReportBuild,
  openSendEvidence,
  openDocs,
  openSettings,
  user,
  canViewAnalyst,
  analystSiteUrl,
  lang,
  setLang,
  authRequired,
  logout,
  t,
}) {
  return (
    <Menu
      id="header-more-menu"
      anchorEl={moreMenuAnchor}
      open={Boolean(moreMenuAnchor)}
      onClose={closeMoreMenu}
      slotProps={{ list: { 'aria-labelledby': 'header-more-button' } }}
      anchorOrigin={isCompact ? { vertical: 'bottom', horizontal: 'left' } : { vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={isCompact ? { vertical: 'top', horizontal: 'left' } : { vertical: 'top', horizontal: 'right' }}
    >
      {!isDesktop && (
        <MenuItem
          onClick={() => {
            openReportBuild();
            closeMoreMenu();
          }}
        >
          {t('app.writeReport')}
        </MenuItem>
      )}
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
      {!isDesktop && (
        <>
          <Divider sx={{ my: 0.5 }} />
          <ListSubheader component="div" disableSticky sx={{ lineHeight: 2 }}>
            {t('settings.section.language')}
          </ListSubheader>
          {LANGUAGE_CODES.map((code) => (
            <MenuItem
              key={code}
              selected={lang === code}
              onClick={() => {
                setLang(code);
                closeMoreMenu();
              }}
            >
              {LANGUAGE_LABELS[code]}
            </MenuItem>
          ))}
        </>
      )}
      {authRequired && (
        <>
          <Divider sx={{ my: 0.5 }} />
          <MenuItem
            onClick={() => {
              logout();
              closeMoreMenu();
            }}
          >
            {t('settings.signOut')}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

function AppShellHeader({
  isDesktop,
  isCompact,
  brandHeader,
  writeReportButton,
  openSendEvidence,
  isPanelPopupOpen,
  headerButtonSx,
  moreMenuButton,
  headerMoreMenu,
  translatingBadge,
  t,
  onHomeClick,
  onMenuClick,
  onNotificationClick,
}) {
  if (isDesktop) {
    return (
      <>
        {brandHeader}
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          sx={{ ml: 'auto', flexShrink: 0 }}
        >
          {writeReportButton}
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
          {moreMenuButton}
          {headerMoreMenu}
          {translatingBadge}
          <LanguageSelector />
        </Stack>
      </>
    );
  }
  if (isCompact) {
    return (
      <Stack spacing={0.75} sx={{ width: '100%' }}>
        <MobileAppBar
          title={t('app.brandTitle')}
          subtitle={t('app.brandSubtitle')}
          logoSrc="/logo_srulik_1_no_text.png"
          logoAlt=""
          onHomeClick={onHomeClick}
          homeAriaLabel={t('app.goToDailyAssessment')}
          onMenuClick={onMenuClick}
          onNotificationClick={onNotificationClick}
          notificationAriaLabel={t('app.moreMenu')}
        />
        {headerMoreMenu}
        {translatingBadge}
      </Stack>
    );
  }
  return (
    <>
      {brandHeader}
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.75}
        sx={{ ml: 'auto', flexShrink: 0 }}
      >
        {moreMenuButton}
        {headerMoreMenu}
        {translatingBadge}
      </Stack>
    </>
  );
}

function useDeepLinkRouting({
  setActiveTab,
  setActivePoolTab,
  setActivePboTab,
  setActivePboRegionTab,
  setOpenReportCompId,
  setOpenReportEvidenceCompId,
}) {
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
  }, [
    setActiveTab,
    setActivePoolTab,
    setActivePboTab,
    setActivePboRegionTab,
    setOpenReportCompId,
    setOpenReportEvidenceCompId,
  ]);
}

// Layout shell: header/more-menu/report tab wiring; heavy JSX lives in child components.
// eslint-disable-next-line sonarjs/cognitive-complexity
function AppShell() {
  const { logout, authRequired, user, accessToken } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { canViewAnalyst } = useDisplayCapabilities();
  const analystSiteUrl = getAnalystSiteUrl();
  const [reportScope, setReportScope] = useState(() => readReportScope());
  const [selectedReportEdition, setSelectedReportEdition] = useState(
    () => readStoredReportEdition(readReportScope()),
  );
  const [scopeSwitchNotice, setScopeSwitchNotice] = useState(null);
  const { editions: availableReportEditions, loading: editionsLoading } = useReportEditions(reportScope, accessToken);
  const effectiveReportEdition = useMemo(() => {
    if (selectedReportEdition) return selectedReportEdition;
    const first = availableReportEditions[0];
    if (!first) return null;
    return { date: first.date, run_id: first.run_id ?? null };
  }, [selectedReportEdition, availableReportEditions]);
  const {
    report,
    scoreBySource,
    reportDate,
    reportGeneratedAt,
    assessmentWindow,
    initialReportLoadDone,
    reportMissingHint,
    reportLoadError,
    attentionItems,
    actionCompass,
    anomalyStrip,
    budgetStatus,
    suggestCrisisBudget,
    operatorEpistemicOverlay,
    refreshReport,
    reportLocalizing,
  } = useTodayReport(reportScope, 'operator', effectiveReportEdition, lang);
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const [activeTab, setActiveTab] = useState(() => readMainTab());
  const [activePoolTab, setActivePoolTab] = useState(() => readPoolTab());
  const [activePboTab, setActivePboTab] = useState(() => readPboTab());
  const [activePboRegionTab, setActivePboRegionTab] = useState(() => readPboRegionTab());
  const reportTopRef = useRef(null);
  const reportContentsNavRef = useRef(null);
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
  const viewportBottomInset = useVisualViewportInset();

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
    writeStoredReportEdition(reportScope, selectedReportEdition);
  }, [reportScope, selectedReportEdition]);

  const scopeInitRef = useRef(true);
  useEffect(() => {
    const isFirst = scopeInitRef.current;
    if (isFirst) {
      scopeInitRef.current = false;
    } else {
      setScopeSwitchNotice(reportScope);
    }
    try {
      localStorage.setItem(LS_REPORT_SCOPE, reportScope);
    } catch { /* */ }
    if (!isFirst) {
      queueMicrotask(() => {
        setSelectedReportEdition(readStoredReportEdition(reportScope));
        setOpenReportCompId(null);
        setOpenReportEvidenceCompId(null);
      });
    }
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
  const isCompact = useMediaQuery(theme.breakpoints.down('sm'));
  const closeMoreMenu = useCallback(() => setMoreMenuAnchor(null), []);
  const openMoreMenu = useCallback((e) => setMoreMenuAnchor(e.currentTarget), []);
  const goToAssessment = useCallback(() => {
    setActiveTab('report');
    reportTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const scrollToAttention = useCallback(() => {
    document.getElementById('attention-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const openSettings = useCallback(
    () => openResponsivePanel(isDesktop, openPanelPopup, 'settings', setSettingsOpen),
    [isDesktop, openPanelPopup],
  );
  const openReportBuild = useCallback(
    () => openResponsivePanel(isDesktop, openPanelPopup, 'report-build', setReportBuildOpen),
    [isDesktop, openPanelPopup],
  );
  const dismissReportBuild = useCallback(() => {
    setReportBuildOpen(false);
  }, []);
  const openSendEvidence = useCallback(
    () => openResponsivePanel(isDesktop, openPanelPopup, 'send-evidence', setSendEvidenceOpen),
    [isDesktop, openPanelPopup],
  );
  const dismissSendEvidence = useCallback(() => {
    setSendEvidenceOpen(false);
  }, []);
  const dismissSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const { displayReport, translating, translateError } = useTranslatedReport(report, lang);

  useDeepLinkRouting({
    setActiveTab,
    setActivePoolTab,
    setActivePboTab,
    setActivePboRegionTab,
    setOpenReportCompId,
    setOpenReportEvidenceCompId,
  });

  const loadedReportEdition = useMemo(() => {
    if (selectedReportEdition) {
      return availableReportEditions.find((e) => editionsMatch(e, selectedReportEdition)) ?? selectedReportEdition;
    }
    return availableReportEditions[0] ?? null;
  }, [selectedReportEdition, availableReportEditions]);

  const scopeSwitchMessage = scopeSwitchNotice
    ? formatTemplate(t('report.edition.scopeSwitched'), { scope: t(`report.scope.${scopeSwitchNotice}`) })
    : null;

  const reportContents = (displayReport?.components ?? []).map((c) => ({
    id: c.component_id,
    label: t(`comp.${c.component_id}`) ?? c.component_id.replaceAll('_', ' '),
  }));

  const chatReportScope = activeTab === 'report' && openReportCompId
    ? {
      type: 'component',
      id: openReportCompId,
      label: reportContents.find((c) => c.id === openReportCompId)?.label ?? openReportCompId,
    }
    : { type: 'all' };

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

  const brandHeader = (
    <BrandHeader
      title={t('app.brandTitle')}
      subtitle={t('app.brandSubtitle')}
      logoSrc="/logo_srulik_1_no_text.png"
      logoAlt=""
      onHomeClick={goToAssessment}
      homeAriaLabel={t('app.goToDailyAssessment')}
    />
  );

  const writeReportButton = (
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
  );

  const moreMenuButton = (
    <IconButton
      id="header-more-button"
      type="button"
      size="small"
      onClick={openMoreMenu}
      aria-label={t('app.moreMenu')}
      aria-controls={moreMenuAnchor ? 'header-more-menu' : undefined}
      aria-haspopup="true"
      aria-expanded={moreMenuAnchor ? 'true' : 'false'}
      sx={moreIconButtonSx}
    >
      <MoreVertIcon fontSize="small" />
    </IconButton>
  );

  const headerMoreMenu = (
    <HeaderMoreMenu
      isDesktop={isDesktop}
      isCompact={isCompact}
      moreMenuAnchor={moreMenuAnchor}
      closeMoreMenu={closeMoreMenu}
      openReportBuild={openReportBuild}
      openSendEvidence={openSendEvidence}
      openDocs={openDocs}
      openSettings={openSettings}
      user={user}
      canViewAnalyst={canViewAnalyst}
      analystSiteUrl={analystSiteUrl}
      lang={lang}
      setLang={setLang}
      authRequired={authRequired}
      logout={logout}
      t={t}
    />
  );

  const translatingBadge = translating && (
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
  );

  const header = (
    <AppShellHeader
      isDesktop={isDesktop}
      isCompact={isCompact}
      brandHeader={brandHeader}
      writeReportButton={writeReportButton}
      openSendEvidence={openSendEvidence}
      isPanelPopupOpen={isPanelPopupOpen}
      headerButtonSx={headerButtonSx}
      moreMenuButton={moreMenuButton}
      headerMoreMenu={headerMoreMenu}
      translatingBadge={translatingBadge}
      t={t}
      onHomeClick={goToAssessment}
      onMenuClick={openMoreMenu}
      onNotificationClick={scrollToAttention}
    />
  );

  const isOutdated = reportDate && reportDate !== todayStr;
  const outdatedMessage = isOutdated
    ? formatTemplate(t('report.outdated'), { date: formatDate(reportDate) })
    : null;

  const dismissEvidenceNotice = useCallback(() => {
    setEvidenceNotice((current) => (current ? { ...current, open: false } : current));
  }, []);

  const dismissScopeSwitchNotice = useCallback(() => {
    setScopeSwitchNotice(null);
  }, []);

  return (
    <AppLayout
      header={header}
      footer={(isCompact && activeTab === 'report') ? null : (
        <SiteFooter
          embeddedInLayout
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
            spacing={{ xs: 1.5, md: 2 }}
          >
            <div ref={reportTopRef} />
            {isCompact ? (
              <MobileDailyAssessmentCard
                reportScope={reportScope}
                onReportScopeChange={setReportScope}
                selectedReportEdition={selectedReportEdition}
                onSelectedReportEditionChange={setSelectedReportEdition}
                editions={availableReportEditions}
                loadedEdition={loadedReportEdition}
                editionsLoading={editionsLoading}
                onOpenReportContents={
                  reportContents.length > 0
                    ? () => reportContentsNavRef.current?.open()
                    : undefined
                }
                outdatedMessage={initialReportLoadDone && report ? outdatedMessage : null}
              />
            ) : (
            <PageHeader
              title={t('nav.dailyAssessment')}
              action={(
                <DailyAssessmentControls
                  reportScope={reportScope}
                  onReportScopeChange={setReportScope}
                  selectedReportEdition={selectedReportEdition}
                  onSelectedReportEditionChange={setSelectedReportEdition}
                  editions={availableReportEditions}
                  loadedEdition={loadedReportEdition}
                  editionsLoading={editionsLoading}
                />
              )}
            />
            )}

            <LocaleStatusBanner reportLocalizing={reportLocalizing} />

            <DailyAssessmentLoadStatus
              initialReportLoadDone={initialReportLoadDone}
              reportLoadError={reportLoadError}
              report={report}
              reportMissingHint={reportMissingHint}
              t={t}
            />

            {initialReportLoadDone && report && (
              <Stack spacing={{ xs: 1.5, md: 2 }}>
              {!isDesktop && reportContents.length > 0 && (
                <ReportContentsMobileNav
                  ref={reportContentsNavRef}
                  contents={reportContents}
                  activeId={openReportCompId}
                  onSelect={jumpToReportComponent}
                  drawerOnly={isCompact}
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
                  {isOutdated && !isCompact && (
                    <Alert
                      severity="warning"
                      variant="outlined"
                      sx={(theme) => ({
                        marginBottom: theme.spacing(1),
                        minWidth: 0,
                        [theme.breakpoints.down('sm')]: {
                          marginBottom: theme.spacing(0.5),
                        },
                        '& .MuiAlert-message': { wordBreak: 'break-word', overflowWrap: 'anywhere' },
                      })}
                    >
                      {outdatedMessage}
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
                      minWidth: 0,
                      [theme.breakpoints.down('sm')]: {
                        overflow: 'visible',
                      },
                      ...mobileFlatReportShellSx(theme),
                    })}
                  >
                    {canViewAnalyst && (
                      <CrisisBudgetPanel
                        budgetStatus={budgetStatus}
                        suggestCrisisBudget={suggestCrisisBudget}
                        onUpdated={() => refreshReport()}
                      />
                    )}
                    <ReportView
                      assessment={displayReport}
                      scoreBySource={displayReport?.score_by_source ?? scoreBySource}
                      displayView="operator"
                      readOnly
                      translating={translating}
                      translateError={translateError}
                      reportDate={reportDate}
                      reportScope={reportScope}
                      generatedAt={reportGeneratedAt}
                      assessmentWindow={assessmentWindow}
                      attentionItems={attentionItems ?? []}
                      actionCompass={actionCompass}
                      anomalyStrip={anomalyStrip}
                      suggestCrisisBudget={suggestCrisisBudget}
                      operatorEpistemicOverlay={operatorEpistemicOverlay}
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
                  showHistoricalSearch
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
          bottomInset={viewportBottomInset}
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
            zIndex: theme.zIndex.tooltip + 5,
            border: theme.custom.border.hairline,
            boxShadow: theme.custom.elevation.chat,
            overflow: 'hidden',
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            ...(isCompact
              ? {
                inset: 0,
                width: '100%',
                height: '100%',
                maxHeight: '100dvh',
                borderRadius: 0,
                paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${viewportBottomInset}px)`,
              }
              : {
                right: theme.spacing(3),
                bottom: `calc(${theme.spacing(7)} + env(safe-area-inset-bottom, 0px) + ${viewportBottomInset}px)`,
                width: chatSize.w,
                height: chatSize.h,
                borderRadius: `${theme.custom.radius.section}px`,
                [theme.breakpoints.down('sm')]: {
                  right: theme.spacing(2),
                },
              }),
          })}
        >
          {!isCompact && (
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
          )}
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
        onClose={dismissEvidenceNotice}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: '16px !important' }}
      >
        <Alert
          severity={evidenceNotice?.severity ?? 'info'}
          variant="filled"
          onClose={dismissEvidenceNotice}
        >
          {evidenceNotice?.message ?? ''}
        </Alert>
      </Snackbar>
      <Snackbar
        open={Boolean(scopeSwitchMessage)}
        autoHideDuration={5000}
        onClose={dismissScopeSwitchNotice}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="info" variant="filled" onClose={dismissScopeSwitchNotice}>
          {scopeSwitchMessage}
        </Alert>
      </Snackbar>
    </AppLayout>
  );
}

DailyAssessmentLoadStatus.propTypes = {
  initialReportLoadDone: PropTypes.bool,
  reportLoadError: PropTypes.string,
  report: PropTypes.object,
  reportMissingHint: PropTypes.string,
  t: PropTypes.func.isRequired,
};

HeaderMoreMenu.propTypes = {
  isDesktop: PropTypes.bool,
  isCompact: PropTypes.bool,
  moreMenuAnchor: PropTypes.object,
  closeMoreMenu: PropTypes.func.isRequired,
  openReportBuild: PropTypes.func.isRequired,
  openSendEvidence: PropTypes.func.isRequired,
  openDocs: PropTypes.func.isRequired,
  openSettings: PropTypes.func.isRequired,
  user: PropTypes.object,
  canViewAnalyst: PropTypes.bool,
  analystSiteUrl: PropTypes.string,
  lang: PropTypes.string,
  setLang: PropTypes.func.isRequired,
  authRequired: PropTypes.bool,
  logout: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};

AppShellHeader.propTypes = {
  isDesktop: PropTypes.bool,
  isCompact: PropTypes.bool,
  brandHeader: PropTypes.node,
  writeReportButton: PropTypes.node,
  openSendEvidence: PropTypes.func.isRequired,
  isPanelPopupOpen: PropTypes.func.isRequired,
  headerButtonSx: PropTypes.object,
  moreMenuButton: PropTypes.node,
  headerMoreMenu: PropTypes.node,
  translatingBadge: PropTypes.node,
  t: PropTypes.func.isRequired,
  onHomeClick: PropTypes.func.isRequired,
  onMenuClick: PropTypes.func.isRequired,
  onNotificationClick: PropTypes.func.isRequired,
};

export function MainApp() {
  return <AppShell />;
}
