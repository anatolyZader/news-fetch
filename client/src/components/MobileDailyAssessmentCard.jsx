import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import NativeSelect from '@mui/material/NativeSelect';
import Alert from '@mui/material/Alert';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import {
  mobileFieldRowSx,
  mobileSegmentedPillsSx,
  mobileSurfaceCardSx,
} from '../ui/responsive/mobileDashboardSx.js';

export function MobileDailyAssessmentCard({
  reportScope,
  onReportScopeChange,
  selectedReportDate,
  onSelectedReportDateChange,
  availableReportDates = [],
  onOpenReportContents,
  outdatedMessage = null,
}) {
  const { t } = useLanguage();

  return (
    <Box sx={(theme) => mobileSurfaceCardSx(theme)}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center">
          <GridViewOutlinedIcon fontSize="small" color="primary" />
          <Typography variant="h2" component="h2" sx={{ m: 0, fontSize: '1.05rem' }}>
            {t('nav.dailyAssessment')}
          </Typography>
        </Stack>

        <ToggleButtonGroup
          exclusive
          size="small"
          value={reportScope}
          onChange={(_, next) => {
            if (next) onReportScopeChange(next);
          }}
          aria-label={t('report.scope.label')}
          sx={(theme) => mobileSegmentedPillsSx(theme)}
        >
          <ToggleButton value="national">{t('report.scope.national')}</ToggleButton>
          <ToggleButton value="north">{t('report.scope.north')}</ToggleButton>
        </ToggleButtonGroup>

        <Box
          component="label"
          sx={(theme) => ({
            ...mobileFieldRowSx(theme),
            position: 'relative',
            display: 'flex',
            cursor: 'pointer',
          })}
        >
          <CalendarTodayOutlinedIcon fontSize="small" color="action" sx={{ flexShrink: 0 }} />
          <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
            {selectedReportDate || t('report.latestLabel')}
          </Typography>
          <NativeSelect
            value={selectedReportDate ?? ''}
            onChange={(e) => onSelectedReportDateChange(e.target.value || null)}
            inputProps={{ 'aria-label': t('report.latestLabel') }}
            sx={{
              position: 'absolute',
              inset: 0,
              opacity: 0,
              width: '100%',
              height: '100%',
              cursor: 'pointer',
            }}
          >
            <option value="">{t('report.latestLabel')}</option>
            {availableReportDates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </NativeSelect>
          <ChevronRightIcon fontSize="small" color="action" sx={{ flexShrink: 0, transform: 'rotate(90deg)' }} />
        </Box>

        {onOpenReportContents && (
          <Box
            component="button"
            type="button"
            onClick={onOpenReportContents}
            sx={(theme) => ({
              ...mobileFieldRowSx(theme),
              border: 'none',
              font: 'inherit',
              color: theme.palette.primary.main,
            })}
          >
            <ListAltOutlinedIcon fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
            <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, textAlign: 'start' }}>
              {t('app.reportContents')}
            </Typography>
            <ChevronRightIcon fontSize="small" color="primary" sx={{ flexShrink: 0 }} />
          </Box>
        )}

        {outdatedMessage && (
          <Alert severity="warning" variant="outlined" sx={{ minWidth: 0, '& .MuiAlert-message': { wordBreak: 'break-word' } }}>
            {outdatedMessage}
          </Alert>
        )}
      </Stack>
    </Box>
  );
}

MobileDailyAssessmentCard.propTypes = {
  reportScope: PropTypes.string.isRequired,
  onReportScopeChange: PropTypes.func.isRequired,
  selectedReportDate: PropTypes.string,
  onSelectedReportDateChange: PropTypes.func.isRequired,
  availableReportDates: PropTypes.arrayOf(PropTypes.string),
  onOpenReportContents: PropTypes.func,
  outdatedMessage: PropTypes.string,
};
