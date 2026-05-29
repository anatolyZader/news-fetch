import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { alpha, useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../ui/index.js';
import { formatDate } from '../lib/date.js';
import { MarkdownArticle } from '../ui/MarkdownArticle.jsx';
import { useRegionalPboReports } from '../hooks/useRegionalPboReports.js';
import PropTypes from 'prop-types';

/** Daily markdown reports from one regional PBO inbox within a home-front district. */
export function PboRegionalDailyReports({ districtId = 'north', regionId }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { apiReady, getIdToken } = useAuth();
  const { data, loading, error, reload } = useRegionalPboReports({
    districtId,
    regionId,
    getIdToken,
    apiReady,
  });

  const regionTitle = t(`pbo.region.${regionId}`);
  const sub = t('pbo.regionDaily.subtitle');

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
              borderRadius: `${th.custom.radius.section}px`,
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
                    {row.title || (row.date ? formatDate(row.date) : row.file)}
                  </Typography>
                  {row.date ? (
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(row.date)}
                    </Typography>
                  ) : null}
                  <Typography variant="caption" color="text.secondary">
                    {t('pbo.regionDay.inboxLocation')}: {row.inboxPath}
                  </Typography>
                  {row.excerpt ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {row.excerpt}
                    </Typography>
                  ) : null}
                </Stack>
              </AccordionSummary>

              <AccordionDetails sx={{ paddingTop: 2, paddingX: 2, paddingBottom: 2 }}>
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ display: 'block', mb: 1.25, wordBreak: 'break-all' }}
                >
                  {t('pbo.regionDay.sourceFile')}: {row.file}
                </Typography>
                <MarkdownArticle markdown={row.content || ''} variant="report" maxWidth="100%" />
              </AccordionDetails>
            </Accordion>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}

PboRegionalDailyReports.propTypes = {
  districtId: PropTypes.string,
  regionId: PropTypes.string.isRequired,
};
