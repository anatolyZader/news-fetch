import { forwardRef, useImperativeHandle, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
import { alpha } from '@mui/material/styles';
import PropTypes from 'prop-types';
import { useLanguage } from '../context/LanguageContext.jsx';
import { SidebarItem } from '../ui/SidebarItem.jsx';

/**
 * Mobile-only report TOC: drawer (+ chip scroller on sm–md). Hidden on md+.
 * xs: drawer-only — call ref.open() from parent card row.
 */
export const ReportContentsMobileNav = forwardRef(function ReportContentsMobileNav({
  contents,
  activeId,
  onSelect,
  drawerOnly = false,
}, ref) {
  const { t, lang } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerAnchor = lang === 'he' ? 'right' : 'left';

  useImperativeHandle(ref, () => ({
    open: () => setDrawerOpen(true),
    close: () => setDrawerOpen(false),
  }));

  function handleSelect(id) {
    onSelect(id);
    setDrawerOpen(false);
  }

  const drawer = (
    <Drawer
      anchor={drawerAnchor}
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      slotProps={{ paper: { sx: { width: 'min(320px, 88vw)' } } }}
    >
      <Stack spacing={0} sx={{ height: '100%' }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={(theme) => ({
            padding: theme.spacing(1.5, 2),
            borderBottom: theme.custom.border.hairline,
          })}
        >
          <Typography variant="h3" component="p" sx={{ margin: 0 }}>
            {t('app.reportContents')}
          </Typography>
          <IconButton
            type="button"
            aria-label={t('app.close')}
            onClick={() => setDrawerOpen(false)}
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Box
          component="nav"
          aria-label={t('app.ariaReportContents')}
          sx={{ flex: 1, overflow: 'auto' }}
        >
          {contents.map((c, index) => (
            <SidebarItem
              key={c.id}
              grouped
              isLast={index === contents.length - 1}
              active={activeId === c.id}
              onClick={() => handleSelect(c.id)}
            >
              {c.label}
            </SidebarItem>
          ))}
        </Box>
      </Stack>
    </Drawer>
  );

  if (drawerOnly) {
    return (
      <Box sx={{ display: { xs: 'block', sm: 'none', md: 'none' } }}>
        {drawer}
      </Box>
    );
  }

  return (
    <Box
      data-tour="report-contents"
      sx={(theme) => ({
        display: 'none',
        [theme.breakpoints.down('md')]: {
          display: 'block',
          position: 'sticky',
          top: 0,
          zIndex: theme.zIndex.appBar - 1,
          marginBottom: 0,
          paddingTop: theme.spacing(0.25),
          paddingBottom: theme.spacing(0.25),
          background: alpha(theme.palette.background.paper, 0.92),
          backdropFilter: 'blur(8px)',
        },
      })}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
        <Button
          type="button"
          size="small"
          variant="outlined"
          startIcon={<MenuIcon fontSize="small" />}
          onClick={() => setDrawerOpen(true)}
          aria-label={t('app.openReportContents')}
          sx={(theme) => ({
            flexShrink: 0,
            display: { xs: 'inline-flex', sm: 'none' },
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: `${theme.custom.radius.section}px`,
          })}
        >
          {t('app.reportContents')}
        </Button>
        <IconButton
          type="button"
          size="small"
          aria-label={t('app.openReportContents')}
          onClick={() => setDrawerOpen(true)}
          sx={(theme) => ({
            flexShrink: 0,
            display: { xs: 'none', sm: 'inline-flex' },
            border: theme.custom.border.hairline,
            borderRadius: `${theme.custom.radius.section}px`,
          })}
        >
          <MenuIcon fontSize="small" />
        </IconButton>
        <Box
          sx={(theme) => ({
            flex: 1,
            minWidth: 0,
            display: { xs: 'none', sm: 'flex' },
            gap: theme.spacing(0.75),
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            scrollSnapType: 'x mandatory',
            msOverflowStyle: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
            paddingBottom: theme.spacing(0.25),
          })}
        >
          {contents.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              size="small"
              clickable
              color={activeId === c.id ? 'primary' : 'default'}
              variant={activeId === c.id ? 'filled' : 'outlined'}
              onClick={() => handleSelect(c.id)}
              sx={{ flexShrink: 0, scrollSnapAlign: 'start', maxWidth: 220 }}
            />
          ))}
        </Box>
      </Stack>
      {drawer}
    </Box>
  );
});

ReportContentsMobileNav.propTypes = {
  contents: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    }),
  ).isRequired,
  activeId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  drawerOnly: PropTypes.bool,
};

ReportContentsMobileNav.displayName = 'ReportContentsMobileNav';
