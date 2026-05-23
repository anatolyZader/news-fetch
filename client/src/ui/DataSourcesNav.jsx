import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLanguage } from '../context/LanguageContext.jsx';
import { PrimaryTab } from './PrimaryTab.jsx';

/**
 * Persistent data-source tab strip — single-row ruler (label + tabs inline).
 * Source views: ruler first, then a prominent back-to-results control (no breadcrumb).
 */
export function DataSourcesNav({
  isOnAssessment,
  activeSourceId,
  sources,
  onSelectSource,
  onGoToAssessment,
}) {
  const { t } = useLanguage();

  const sourceRuler = (
    <Stack
      component="div"
      role="tablist"
      aria-label={t('app.ariaDataSources')}
      direction="row"
      alignItems="flex-end"
      flexWrap="wrap"
      sx={(th) => ({ borderBottom: th.custom.border.hairline })}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        component="span"
        sx={(th) => ({
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          paddingTop: th.spacing(0.75),
          paddingBottom: th.spacing(0.75),
          paddingLeft: th.spacing(1.5),
          paddingRight: th.spacing(0.5),
          flexShrink: 0,
          userSelect: 'none',
        })}
      >
        {t('nav.dataSources')}
      </Typography>
      {sources.map((source) => (
        <PrimaryTab
          key={source.id}
          compact
          active={!isOnAssessment && activeSourceId === source.id}
          onClick={() => onSelectSource(source.id)}
        >
          {source.label}
        </PrimaryTab>
      ))}
    </Stack>
  );

  if (isOnAssessment) {
    return (
      <Box component="nav" aria-label={t('app.ariaDataSources')}>
        {sourceRuler}
      </Box>
    );
  }

  return (
    <Stack
      component="nav"
      aria-label={t('app.ariaDataSources')}
      spacing={3}
      sx={(th) => ({
        paddingTop: th.spacing(0.5),
        paddingBottom: th.spacing(2.5),
      })}
    >
      {sourceRuler}
      <Button
        type="button"
        variant="outlined"
        size="large"
        startIcon={<ArrowBackIcon />}
        onClick={onGoToAssessment}
        sx={(th) => ({
          alignSelf: 'flex-start',
          textTransform: 'none',
          fontWeight: 600,
          fontSize: th.typography.sectionTitle.fontSize,
          lineHeight: 1.35,
          paddingTop: th.spacing(1.25),
          paddingBottom: th.spacing(1.25),
          paddingLeft: th.spacing(2),
          paddingRight: th.spacing(2.5),
          borderRadius: th.custom.radius.lg,
          borderWidth: 1,
          borderColor: th.palette.divider,
          color: th.palette.text.primary,
          backgroundColor: th.palette.background.paper,
          boxShadow: th.custom.elevation.subtle,
          '& .MuiButton-startIcon': { color: th.palette.text.secondary },
          '&:hover': {
            borderWidth: 1,
            borderColor: th.palette.text.secondary,
            background: th.palette.action.hover,
            color: th.palette.text.primary,
          },
        })}
      >
        {t('nav.backToAnalysisResults')}
      </Button>
    </Stack>
  );
}
