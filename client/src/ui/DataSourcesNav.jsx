import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { panelHeaderButtonSx } from './panelChrome.js';
import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLanguage } from '../context/LanguageContext.jsx';
import { PrimaryTab } from './PrimaryTab.jsx';
import { DataSourcesMobileNav } from './DataSourcesMobileNav.jsx';

/**
 * Persistent data-source tab strip — label column + equal-width tabs across full width.
 * Below md: bottom sheet (xs) or chip scroller (sm–md).
 */
export function DataSourcesNav({
  isOnAssessment,
  activeSourceId,
  sources,
  onSelectSource,
  onGoToAssessment,
}) {
  const { t } = useLanguage();

  const desktopSourceRuler = (
    <Stack
      direction="row"
      alignItems="stretch"
      sx={(th) => ({
        display: { xs: 'none', md: 'flex' },
        width: '100%',
        minWidth: 0,
        overflow: 'hidden',
        borderBottom: th.custom.border.hairline,
      })}
    >
      <Box
        component="p"
        sx={(th) => ({
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          margin: 0,
          paddingTop: th.spacing(1.25),
          paddingBottom: th.spacing(1.25),
          paddingLeft: th.spacing(2),
          paddingRight: th.spacing(2),
          borderRight: th.custom.border.hairline,
          backgroundColor: alpha(th.palette.primary.light, 0.35),
          color: th.palette.text.secondary,
          ...th.typography.eyebrow,
          letterSpacing: '0.08em',
          userSelect: 'none',
        })}
      >
        {t('nav.dataSources')}
      </Box>

      <Stack
        component="div"
        role="tablist"
        aria-label={t('app.ariaDataSources')}
        direction="row"
        alignItems="flex-end"
        sx={{ flex: 1, minWidth: 0 }}
      >
        {sources.map((source) => (
          <PrimaryTab
            key={source.id}
            active={!isOnAssessment && activeSourceId === source.id}
            onClick={() => onSelectSource(source.id)}
            sx={(th) => ({
              flex: 1,
              minWidth: 0,
              justifyContent: 'center',
              fontSize: th.typography.body1.fontSize,
              fontWeight: !isOnAssessment && activeSourceId === source.id ? 600 : 500,
              paddingTop: th.spacing(1.25),
              paddingBottom: th.spacing(1.25),
              paddingLeft: th.spacing(0.75),
              paddingRight: th.spacing(0.75),
              whiteSpace: 'nowrap',
            })}
          >
            {source.label}
          </PrimaryTab>
        ))}
      </Stack>
    </Stack>
  );

  const mobileNav = (
    <DataSourcesMobileNav
      sources={sources}
      activeSourceId={activeSourceId}
      isOnAssessment={isOnAssessment}
      onSelectSource={onSelectSource}
    />
  );

  const navBody = (
    <>
      {mobileNav}
      {desktopSourceRuler}
    </>
  );

  if (isOnAssessment) {
    return (
      <Box component="nav" aria-label={t('app.ariaDataSources')} sx={{ width: '100%' }}>
        {navBody}
      </Box>
    );
  }

  return (
    <Stack
      component="nav"
      aria-label={t('app.ariaDataSources')}
      spacing={3}
      sx={(th) => ({
        width: '100%',
        paddingTop: th.spacing(0.5),
        paddingBottom: th.spacing(2.5),
      })}
    >
      {navBody}
      <Button
        type="button"
        variant="outlined"
        size="large"
        startIcon={<ArrowBackIcon />}
        onClick={onGoToAssessment}
        sx={(th) => ({
          ...panelHeaderButtonSx(th),
          alignSelf: 'flex-start',
          textTransform: 'none',
          fontWeight: 600,
          fontSize: th.typography.sectionTitle.fontSize,
          lineHeight: 1.35,
          paddingTop: th.spacing(1.25),
          paddingBottom: th.spacing(1.25),
          paddingLeft: th.spacing(2),
          paddingRight: th.spacing(2.5),
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

DataSourcesNav.propTypes = {
  isOnAssessment: PropTypes.bool,
  activeSourceId: PropTypes.string,
  sources: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ).isRequired,
  onSelectSource: PropTypes.func.isRequired,
  onGoToAssessment: PropTypes.func.isRequired,
};
