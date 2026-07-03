import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { formatDate, formatPublishedDateTime } from '../lib/date.js';
import { formatTemplate } from '../lib/i18nFormat.js';
import {
  countEditionsForDate,
  editionSelectionKey,
  editionsMatch,
  formatEditionPickerTriggerParts,
  formatWindowRangeLabel,
  resolveActiveEdition,
  shouldLabelEditionRunTime,
} from '../lib/reportEditionFormat.js';

const editionShape = PropTypes.shape({
  date: PropTypes.string.isRequired,
  run_id: PropTypes.string,
  generated_at: PropTypes.string,
  assessment_days: PropTypes.number,
  window_start: PropTypes.string,
  window_end: PropTypes.string,
  total_articles: PropTypes.number,
  is_today: PropTypes.bool,
});

const editionSelectionShape = PropTypes.shape({
  date: PropTypes.string.isRequired,
  run_id: PropTypes.string,
});

function EditionMenuRow({ t, edition, isNewest, sameDateCount }) {
  const signalsLine = formatWindowRangeLabel(t, edition);
  const showRunLabel = shouldLabelEditionRunTime(edition, sameDateCount);
  const runLine = edition.generated_at
    ? formatTemplate(t('report.edition.analyzedAt'), {
      time: formatPublishedDateTime(edition.generated_at),
    })
    : null;
  const title = formatTemplate(t('report.freshness.reportDate'), {
    date: formatDate(edition.date),
  });

  return (
    <Box sx={{ py: 0.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {isNewest && (
          <Chip size="small" label={t('report.edition.newest')} color="primary" sx={{ height: 20 }} />
        )}
      </Box>
      <Typography variant="caption" color="text.primary" component="p" sx={{ mt: 0.25, display: 'block' }}>
        {signalsLine}
      </Typography>
      {runLine && showRunLabel && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ display: 'block' }}>
          {runLine}
        </Typography>
      )}
    </Box>
  );
}

EditionMenuRow.propTypes = {
  t: PropTypes.func.isRequired,
  edition: editionShape.isRequired,
  isNewest: PropTypes.bool,
  sameDateCount: PropTypes.number,
};

export function ReportEditionPicker({
  editions = [],
  selectedEdition = null,
  loadedEdition = null,
  onChange,
  loading = false,
  compact = false,
}) {
  const { t } = useLanguage();
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const active = resolveActiveEdition(loadedEdition, selectedEdition, editions);

  if (loading && editions.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 32 }}>
        <CircularProgress size={18} />
      </Box>
    );
  }

  if (editions.length === 0) return null;

  const triggerParts = formatEditionPickerTriggerParts(t, active);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        disableRipple
        disableFocusRipple
        onClick={(e) => setAnchorEl(e.currentTarget)}
        endIcon={<KeyboardArrowDownIcon fontSize="small" />}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-label={t('report.edition.pickerLabel')}
        sx={(theme) => ({
          textTransform: 'none',
          borderColor: theme.palette.divider,
          borderRadius: `${theme.custom.radius.section}px`,
          maxWidth: compact ? '100%' : 200,
          justifyContent: 'space-between',
          px: 1.25,
          py: 0.75,
          fontSize: theme.typography.body2.fontSize,
          fontWeight: 500,
          color: theme.palette.text.primary,
          alignItems: 'center',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        })}
      >
        <Box
          component="span"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'start',
            lineHeight: 1.35,
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {triggerParts.join(' · ')}
        </Box>
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        slotProps={{
          paper: {
            sx: {
              minWidth: 300,
              maxWidth: 420,
              maxHeight: 360,
            },
          },
        }}
      >
        {editions.map((edition, index) => {
          const isNewest = index === 0;
          const isSelected = selectedEdition
            ? editionsMatch(edition, selectedEdition)
            : isNewest;
          const rowSameDateCount = countEditionsForDate(editions, edition.date);
          return (
            <MenuItem
              key={editionSelectionKey(edition)}
              selected={isSelected}
              onClick={() => {
                onChange(isNewest ? null : { date: edition.date, run_id: edition.run_id ?? null });
                setAnchorEl(null);
              }}
              sx={{ alignItems: 'flex-start', py: 1.25 }}
            >
              <EditionMenuRow
                t={t}
                edition={edition}
                isNewest={isNewest}
                sameDateCount={rowSameDateCount}
              />
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}

ReportEditionPicker.propTypes = {
  editions: PropTypes.arrayOf(editionShape),
  selectedEdition: editionSelectionShape,
  loadedEdition: editionShape,
  onChange: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  compact: PropTypes.bool,
};
