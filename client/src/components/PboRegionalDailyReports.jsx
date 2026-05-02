import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { alpha, useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../ui/index.js';
import { formatDate } from '../lib/date.js';
import { scoreBg01, scoreColor01 } from '../lib/score.js';
import { useRegionalPboReports } from '../hooks/useRegionalPboReports.js';

function normalizeMuniLabel(s) {
  return String(s ?? '')
    .trim()
    .replace(/\u200f/g, '');
}

/** Mean across components for one municipality row. */
function meanMunicipalityScores(municipalities, componentsOrder) {
  if (!municipalities?.length || !componentsOrder?.length) return null;
  const vals = municipalities.map((m) => {
    const avgs = componentsOrder.map((cid) => m.components?.[cid]?.avg).filter((v) => v != null);
    if (!avgs.length) return null;
    return avgs.reduce((a, b) => a + b, 0) / avgs.length;
  }).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function scorePillLabel(v) {
  return v != null ? Math.round(v * 100) + '%' : '—';
}

function MeanScorePill({ value, theme }) {
  const v = typeof value === 'number' ? value : null;
  return (
    <Typography
      component="span"
      sx={(th) => ({
        fontWeight: 700,
        fontSize: th.typography.pill.fontSize,
        color: scoreColor01(v, theme),
        background: scoreBg01(v, theme),
        paddingLeft: th.spacing(0.85),
        paddingRight: th.spacing(0.85),
        paddingTop: th.spacing(0.35),
        paddingBottom: th.spacing(0.35),
        borderRadius: th.custom.radius.pill,
        border: th.custom.border.hairline,
      })}
    >
      {scorePillLabel(v)}
    </Typography>
  );
}

/** Daily reports from one north regional PBO inbox — not filtered from municipal dashboards. */
export function PboRegionalDailyReports({ regionId }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { apiReady, getIdToken } = useAuth();
  const { data, loading, error, reload } = useRegionalPboReports({
    regionId,
    getIdToken,
    apiReady,
  });

  const regionTitle = t(`pbo.region.${regionId}`);
  const sub = t('pbo.regionDaily.subtitle');
  const order = data?.componentsOrder ?? [];

  if (!apiReady || loading) {
    return (
      <Box sx={{ paddingTop: 2, paddingX: 2 }}>
        <PageHeader title={regionTitle} subtitle={sub} />
        <Box sx={{ marginTop: 2 }}>
          <LoadingState>{t('pbo.regionDaily.loading')}</LoadingState>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ paddingTop: 2, paddingX: 2 }}>
        <PageHeader title={regionTitle} subtitle={sub} />
        <Stack spacing={2} sx={{ marginTop: 2 }}>
          <ErrorState>{error}</ErrorState>
          <Button type="button" variant="outlined" size="small" onClick={() => reload()}>
            {t('visit.refresh')}
          </Button>
        </Stack>
      </Box>
    );
  }

  const days = data?.days ?? [];
  if (days.length === 0) {
    return (
      <Box sx={{ paddingTop: 2, paddingX: 2 }}>
        <PageHeader title={regionTitle} subtitle={sub} />
        <Box sx={{ marginTop: 2 }}>
          <EmptyState>{t('pbo.regionDaily.empty')}</EmptyState>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ paddingTop: 2, paddingX: 2, paddingBottom: 3 }}>
      <PageHeader title={regionTitle} subtitle={sub} />

      <Stack component="nav" spacing={1.25} sx={{ mt: 2 }} aria-label={t('pbo.regionDaily.listAria')}>
        {days.map((row, idx) => (
          <Paper
            key={`${regionId}:${row.file}`}
            elevation={0}
            sx={(th) => ({
              border: th.custom.border.hairline,
              borderRadius: th.custom.radius.lg,
              overflow: 'hidden',
              background:
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.background.paper, 0.6)
                  : theme.palette.background.paper,
            })}
          >
            <Accordion
              elevation={0}
              disableGutters
              square
              defaultExpanded={idx === 0}
              sx={{ background: 'transparent' }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={(th) => ({
                  minHeight: 56,
                  '& .MuiAccordionSummary-content': { alignItems: 'center', flexWrap: 'wrap', gap: 1 },
                  paddingLeft: th.spacing(2),
                  paddingRight: th.spacing(2),
                })}
              >
                <Stack direction="column" spacing={0.35} sx={{ flex: '1 1 auto', minWidth: 140 }}>
                  <Typography variant="cardTitle">
                    {row.date ? formatDate(row.date) : row.file}
                  </Typography>
                  {row.date ? (
                    <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                      {row.file}
                    </Typography>
                  ) : null}
                  <Typography variant="caption" color="text.secondary">
                    {t('pbo.regionDay.inboxLocation')}: {row.inboxPath}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('pbo.regionDay.municipalitiesCount').replace(
                      '{n}',
                      String(row.municipalityCount ?? 0),
                    )}
                  </Typography>
                  {!row.parseOk && row.parseError ? (
                    <Typography variant="caption" color="warning.main">
                      {row.parseError === 'empty_or_unknown_format'
                        ? t('pbo.regionDay.parseEmpty')
                        : row.parseError}
                    </Typography>
                  ) : null}
                </Stack>
                <MeanScorePill
                  value={
                    typeof row.meanScore === 'number' ? row.meanScore : null
                  }
                  theme={theme}
                />
              </AccordionSummary>

              <AccordionDetails sx={{ paddingTop: 2, paddingX: 2, paddingBottom: 2 }}>
                {!row.parseOk ? (
                  <Alert severity="warning" variant="outlined">
                    {row.parseError === 'empty_or_unknown_format'
                      ? t('pbo.regionDay.parseEmpty')
                      : t('pbo.regionDay.parseIssue').replace(
                          '{detail}',
                          String(row.parseError ?? ''),
                        )}
                  </Alert>
                ) : (
                  <>
                    <Typography
                      variant="overline"
                      color="text.secondary"
                      sx={{ display: 'block', mb: 1.25 }}
                    >
                      {t('pbo.regionDay.perMunicipality')}
                    </Typography>
                    <Stack spacing={1.25} divider={<Divider flexItem variant="middle" />}>
                      {row.municipalities.map((muni, mi) => {
                        const mn = normalizeMuniLabel(muni.name);
                        const mMean = meanMunicipalityScores([muni], order);
                        return (
                          <Stack
                            key={`${row.file}-${mi}-${mn}`}
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            spacing={1}
                          >
                            <Typography variant="body2" sx={{ wordBreak: 'break-word', flex: 1 }}>
                              {muni.name}
                            </Typography>
                            <MeanScorePill value={mMean} theme={theme} />
                          </Stack>
                        );
                      })}
                    </Stack>
                  </>
                )}
              </AccordionDetails>
            </Accordion>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
