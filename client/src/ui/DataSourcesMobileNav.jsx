import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { SidebarItem } from './SidebarItem.jsx';
import { scrollFadeEdgeSx } from './responsive/responsiveSx.js';
import {
  mobileHeroCardSx,
  mobileHeroEyebrowSx,
  mobileHeroPickerSx,
} from './responsive/mobileDashboardSx.js';

function EyebrowLabel({ children, inset = false }) {
  return (
    <Box
      component="p"
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        margin: 0,
        width: inset ? '100%' : undefined,
        paddingTop: theme.spacing(inset ? 0.75 : 1.25),
        paddingBottom: theme.spacing(inset ? 0.75 : 1.25),
        paddingLeft: theme.spacing(inset ? 1.25 : 1.5),
        paddingRight: theme.spacing(inset ? 1.25 : 1.5),
        backgroundColor: alpha(theme.palette.primary.light, 0.35),
        color: theme.palette.text.secondary,
        ...theme.typography.eyebrow,
        letterSpacing: '0.08em',
        userSelect: 'none',
        ...(inset
          ? {
            borderBottom: theme.custom.border.hairline,
          }
          : {
            [theme.breakpoints.between('sm', 'md')]: {
              paddingLeft: theme.spacing(2),
              paddingRight: theme.spacing(2),
            },
          }),
      })}
    >
      {children}
    </Box>
  );
}

EyebrowLabel.propTypes = {
  children: PropTypes.node.isRequired,
  inset: PropTypes.bool,
};

/**
 * Mobile data-source nav: bottom sheet on xs, chip scroller on sm–md. Hidden on md+.
 */
export function DataSourcesMobileNav({
  sources,
  activeSourceId,
  isOnAssessment,
  onSelectSource,
}) {
  const { t } = useLanguage();
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeSource = sources.find((s) => s.id === activeSourceId);
  const triggerLabel = isOnAssessment || !activeSource
    ? t('nav.chooseDataSource')
    : activeSource.label;

  function handleSelect(id) {
    onSelectSource(id);
    setSheetOpen(false);
  }

  function isActive(sourceId) {
    return !isOnAssessment && activeSourceId === sourceId;
  }

  return (
    <Box
      sx={(theme) => ({
        display: 'none',
        width: '100%',
        [theme.breakpoints.down('md')]: {
          display: 'block',
        },
      })}
    >
      <Stack
        direction="column"
        alignItems="stretch"
        sx={{
          display: { xs: 'flex', sm: 'none' },
        }}
      >
        <Box sx={(theme) => mobileHeroCardSx(theme)}>
          <Typography component="p" sx={(theme) => mobileHeroEyebrowSx(theme)}>
            {t('nav.dataSources')}
          </Typography>
          <Button
            type="button"
            variant="text"
            fullWidth
            endIcon={<ExpandMoreIcon />}
            onClick={() => setSheetOpen(true)}
            aria-label={t('app.openDataSources')}
            aria-haspopup="listbox"
            aria-expanded={sheetOpen}
            sx={(theme) => mobileHeroPickerSx(theme)}
          >
            {triggerLabel}
          </Button>
        </Box>
      </Stack>

      <Stack
        direction="column"
        sx={{
          display: { xs: 'none', sm: 'flex', md: 'none' },
        }}
      >
        <Box
          sx={(theme) => ({
            width: '100%',
            border: theme.custom.border.hairline,
            borderRadius: `${theme.custom.radius.section}px`,
            overflow: 'hidden',
            backgroundColor: theme.palette.background.paper,
          })}
        >
          <EyebrowLabel inset>{t('nav.dataSources')}</EyebrowLabel>
          <Box
            role="tablist"
            aria-label={t('app.ariaDataSources')}
            sx={[
              (theme) => ({
                display: 'flex',
                gap: theme.spacing(0.75),
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                scrollSnapType: 'x mandatory',
                msOverflowStyle: 'none',
                padding: theme.spacing(1, 1.25, 1.25),
                '&::-webkit-scrollbar': { display: 'none' },
              }),
              scrollFadeEdgeSx,
            ]}
          >
            {sources.map((source) => (
              <Chip
                key={source.id}
                data-tour={`source-tab-${source.id}`}
                role="tab"
                aria-selected={isActive(source.id)}
                label={source.label}
                size="small"
                clickable
                color={isActive(source.id) ? 'primary' : 'default'}
                variant={isActive(source.id) ? 'filled' : 'outlined'}
                onClick={() => handleSelect(source.id)}
                sx={{ flexShrink: 0, scrollSnapAlign: 'start', maxWidth: 220 }}
              />
            ))}
          </Box>
        </Box>
      </Stack>

      <SwipeableDrawer
        anchor="bottom"
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onOpen={() => setSheetOpen(true)}
        disableSwipeToOpen
        slotProps={{
          paper: {
            sx: (theme) => ({
              borderTopLeftRadius: `${theme.custom.radius.section * 1.5}px`,
              borderTopRightRadius: `${theme.custom.radius.section * 1.5}px`,
              maxHeight: 'min(70dvh, 520px)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }),
          },
        }}
      >
        <Stack spacing={0} sx={{ minHeight: 0 }}>
          <Box
            sx={(theme) => ({
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.palette.divider,
              margin: theme.spacing(1.25, 'auto', 0),
              flexShrink: 0,
            })}
          />
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={(theme) => ({
              padding: theme.spacing(1.25, 2, 1),
              borderBottom: theme.custom.border.hairline,
            })}
          >
            <Typography variant="h3" component="p" sx={{ margin: 0 }}>
              {t('app.openDataSources')}
            </Typography>
            <IconButton
              type="button"
              aria-label={t('app.close')}
              onClick={() => setSheetOpen(false)}
              size="small"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Box
            component="nav"
            role="listbox"
            aria-label={t('app.ariaDataSources')}
            sx={{ overflow: 'auto' }}
          >
            {sources.map((source, index) => (
              <SidebarItem
                key={source.id}
                grouped
                isLast={index === sources.length - 1}
                active={isActive(source.id)}
                aria-selected={isActive(source.id)}
                onClick={() => handleSelect(source.id)}
              >
                {source.label}
              </SidebarItem>
            ))}
          </Box>
        </Stack>
      </SwipeableDrawer>
    </Box>
  );
}

DataSourcesMobileNav.propTypes = {
  sources: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ).isRequired,
  activeSourceId: PropTypes.string,
  isOnAssessment: PropTypes.bool,
  onSelectSource: PropTypes.func.isRequired,
};
