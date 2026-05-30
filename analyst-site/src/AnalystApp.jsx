import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import PropTypes from 'prop-types';

import { useTodayReport } from '@client/hooks/useAnalysis.js';
import { useTranslatedReport } from '@client/hooks/useTranslatedReport.js';
import { useResilienceDrift } from '@client/hooks/useResilienceDrift.js';
import { usePipelineStatus } from '@client/hooks/usePipelineStatus.js';
import { useLanguage } from '@client/context/LanguageContext.jsx';
import { ResilienceDriftPanel } from '@client/components/ResilienceDriftPanel.jsx';
import { PipelineStatusPanel } from '@client/components/PipelineStatusPanel.jsx';
import { ReportView } from '@client/components/ReportView.jsx';
import { DistrictScopeSwitcher } from '@client/components/DistrictScopeSwitcher.jsx';
import { LanguageSelector } from '@client/components/LanguageSelector.jsx';
import {
  AppLayout,
  BrandHeader,
  PageHeader,
  PrimaryTab,
  SiteFooter,
} from '@client/ui/index.js';
import { normalizeReportScopeId } from '@client/lib/reportScopes.js';
import { formatDate } from '@client/lib/date.js';

const LS_ANALYST_SCOPE = 'vibeswitch:analystScope';
const LS_ANALYST_SECTION = 'vibeswitch:analystSection';
const SECTION_IDS = new Set(['drift', 'assessment', 'pipeline']);

function readStoredScope() {
  if (typeof localStorage === 'undefined') return 'national';
  try {
    const v = localStorage.getItem(LS_ANALYST_SCOPE);
    if (v) return normalizeReportScopeId(v);
  } catch { /* */ }
  return 'national';
}

function readStoredSection() {
  if (typeof localStorage === 'undefined') return 'drift';
  try {
    const v = localStorage.getItem(LS_ANALYST_SECTION);
    if (v && SECTION_IDS.has(v)) return v;
  } catch { /* */ }
  return 'drift';
}

/**
 * Analyst-only workspace (analyst.vibeswitch.ai). Reuses shared report/drift/pipeline UI.
 */
export function AnalystApp({ logout, user, authRequired }) {
  const { t, lang } = useLanguage();
  const [scope, setScope] = useState(() => readStoredScope());
  const [activeSection, setActiveSection] = useState(() => readStoredSection());

  const {
    report,
    scoreBySource,
    reportDate,
    displayView,
    initialReportLoadDone,
    reportMissingHint,
    attentionItems,
  } = useTodayReport(scope, 'analyst');

  const { displayReport, translating, translateError } = useTranslatedReport(report, lang);
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const driftDays = 30;
  const assessmentReady = displayView === 'analyst';

  const { data: driftData, loading: driftLoading } = useResilienceDrift({
    scope,
    days: driftDays,
    endDate: reportDate || '',
    enabled: activeSection === 'assessment' && assessmentReady,
  });

  const pipelineStatusDate = reportDate || todayStr;
  const {
    data: pipelineStatus,
    loading: pipelineStatusLoading,
    error: pipelineStatusError,
  } = usePipelineStatus({
    scope,
    date: pipelineStatusDate,
    enabled: activeSection === 'pipeline' || activeSection === 'assessment',
  });

  const isOutdated = reportDate && reportDate !== todayStr;

  const sections = useMemo(() => ([
    { id: 'drift', label: t('drift.title') },
    { id: 'assessment', label: t('nav.dailyAssessment') },
    { id: 'pipeline', label: t('pipeline.panelTitle') },
  ]), [t]);

  const onScopeChange = (next) => {
    const normalized = normalizeReportScopeId(next);
    setScope(normalized);
    try {
      localStorage.setItem(LS_ANALYST_SCOPE, normalized);
    } catch { /* */ }
  };

  const onSectionChange = (next) => {
    if (!SECTION_IDS.has(next)) return;
    setActiveSection(next);
    try {
      localStorage.setItem(LS_ANALYST_SECTION, next);
    } catch { /* */ }
  };

  const header = (
    <>
      <BrandHeader
        title="VibeSwitch Analyst"
        subtitle="Calibration & drift workspace"
      />
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.75}
        sx={{ ml: 'auto', flexShrink: 0, flexWrap: { xs: 'wrap', md: 'nowrap' } }}
      >
        <LanguageSelector appearance="ghost" />
        {authRequired && user && (
          <Button size="small" variant="text" onClick={() => logout()}>
            {t('settings.signOut')}
          </Button>
        )}
        <Button
          component={Link}
          href="https://vibeswitch.ai"
          size="small"
          variant="outlined"
          sx={{ whiteSpace: 'nowrap' }}
        >
          Operator app
        </Button>
      </Stack>
    </>
  );

  const footer = (
    <SiteFooter
      variant="minimal"
      onSignOut={logout}
      authRequired={authRequired}
      user={user}
    />
  );

  return (
    <AppLayout header={header} footer={footer}>
      <Stack spacing={2}>
        <PageHeader
          title={sections.find((s) => s.id === activeSection)?.label ?? 'Analyst'}
          scope={(
            <DistrictScopeSwitcher
              value={scope}
              onChange={onScopeChange}
            />
          )}
        />

        <Stack
          component="nav"
          direction="row"
          aria-label="Analyst sections"
          sx={(theme) => ({
            borderBottom: theme.custom.border.hairline,
          })}
        >
          {sections.map((section) => (
            <PrimaryTab
              key={section.id}
              compact
              active={activeSection === section.id}
              onClick={() => onSectionChange(section.id)}
            >
              {section.label}
            </PrimaryTab>
          ))}
        </Stack>

        {activeSection === 'drift' && (
          <Box
            sx={(theme) => ({
              padding: theme.spacing(3),
              border: theme.custom.border.hairline,
              borderRadius: `${theme.custom.radius.section}px`,
              background: theme.palette.background.paper,
              boxShadow: theme.custom.elevation.subtle,
            })}
          >
            <ResilienceDriftPanel scope={scope} />
          </Box>
        )}

        {activeSection === 'pipeline' && (
          <Box
            sx={(theme) => ({
              padding: theme.spacing(3),
              border: theme.custom.border.hairline,
              borderRadius: `${theme.custom.radius.section}px`,
              background: theme.palette.background.paper,
              boxShadow: theme.custom.elevation.subtle,
            })}
          >
            <PipelineStatusPanel
              data={pipelineStatus}
              loading={pipelineStatusLoading}
              error={pipelineStatusError}
              defaultOpen
            />
          </Box>
        )}

        {activeSection === 'assessment' && (
          <Stack spacing={2}>
            {!initialReportLoadDone && (
              <Typography variant="body2" color="text.secondary">
                {t('app.reportLoading')}
              </Typography>
            )}

            {initialReportLoadDone && !report && reportMissingHint?.includes('requires_assess_signals') && (
              <Alert severity="info" variant="outlined">
                {t('app.regionalReportMissingHint', { scope })}
              </Alert>
            )}

            {initialReportLoadDone && !report && (
              <Typography variant="body2" color="text.secondary">
                {t('app.noReportYet')}
              </Typography>
            )}

            {initialReportLoadDone && report && !assessmentReady && (
              <Alert severity="warning" variant="outlined">
                Analyst view was denied for this session. Confirm config/userAccess.json lists your email with level analyst or maintainer.
                signed-in email and that the API proxy forwards Authorization headers.
              </Alert>
            )}

            {initialReportLoadDone && report && assessmentReady && (
              <>
                <PipelineStatusPanel
                  data={pipelineStatus}
                  loading={pipelineStatusLoading}
                  error={pipelineStatusError}
                  defaultOpen={isOutdated || !report}
                />
                {isOutdated && (
                  <Alert severity="warning" variant="outlined">
                    {t('report.outdated').replace('{date}', formatDate(reportDate))}
                  </Alert>
                )}
                <Box
                  sx={(theme) => ({
                    padding: theme.spacing(3),
                    border: theme.custom.border.hairline,
                    borderRadius: `${theme.custom.radius.section}px`,
                    background: theme.palette.background.paper,
                    boxShadow: theme.custom.elevation.subtle,
                  })}
                >
                  <ReportView
                    assessment={displayReport}
                    scoreBySource={displayReport?.score_by_source ?? scoreBySource}
                    displayTier="analyst"
                    readOnly
                    translating={translating}
                    translateError={translateError}
                    reportDate={reportDate}
                    reportScope={scope}
                    driftByComponent={driftData?.per_component ?? null}
                    driftLoading={driftLoading}
                    attentionItems={attentionItems ?? []}
                    driftAlerts={driftData?.alerts ?? null}
                    showValidationReview
                  />
                </Box>
              </>
            )}
          </Stack>
        )}
      </Stack>
    </AppLayout>
  );
}

AnalystApp.propTypes = {
  logout: PropTypes.func.isRequired,
  authRequired: PropTypes.bool,
  user: PropTypes.object,
};
