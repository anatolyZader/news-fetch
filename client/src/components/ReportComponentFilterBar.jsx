import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { FILTER_PRESETS } from '../lib/reportComponentFilter.js';

const LS_FILTER_PREFIX = 'srulik:reportFilter:';
const LS_FILTER_PREFIX_LEGACY = 'vibeswitch:reportFilter:';

function readStoredFilter(scope) {
  if (typeof sessionStorage === 'undefined') {
    return { preset: FILTER_PRESETS.all, selectedComponentIds: null };
  }
  try {
    const raw = sessionStorage.getItem(`${LS_FILTER_PREFIX}${scope ?? 'national'}`);
    if (!raw) return { preset: FILTER_PRESETS.all, selectedComponentIds: null };
    const parsed = JSON.parse(raw);
    return {
      preset: parsed.preset ?? FILTER_PRESETS.all,
      // Component sidebar focus is scroll-only; do not restore stale single-component lenses.
      selectedComponentIds: null,
    };
  } catch {
    return { preset: FILTER_PRESETS.all, selectedComponentIds: null };
  }
}

function writeStoredFilter(scope, state) {
  try {
    sessionStorage.setItem(`${LS_FILTER_PREFIX}${scope ?? 'national'}`, JSON.stringify(state));
  } catch { /* */ }
}

export function ReportComponentFilterBar({
  reportScope = 'national',
  filterState,
  onFilterChange,
}) {
  const { t } = useLanguage();
  const [internal, setInternal] = useState(() => readStoredFilter(reportScope));

  const state = filterState ?? internal;
  const setState = onFilterChange ?? setInternal;

  useEffect(() => {
    writeStoredFilter(reportScope, state);
  }, [reportScope, state]);

  function update(next) {
    setState(next);
  }

  function handlePreset(_e, preset) {
    if (!preset) return;
    update({ preset, selectedComponentIds: null });
  }

  return (
    <Box
      sx={(theme) => ({
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        background: theme.palette.background.paper,
        padding: theme.spacing(1.5, 2),
      })}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 600, marginBottom: 1 }}>
        {t('report.filter.title')}
      </Typography>
      <Stack spacing={1.25}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={state.selectedComponentIds?.length ? FILTER_PRESETS.all : state.preset}
          onChange={handlePreset}
        >
          <ToggleButton value={FILTER_PRESETS.all}>{t('report.filter.all')}</ToggleButton>
          <ToggleButton value={FILTER_PRESETS.needs_attention}>{t('report.filter.needsAttention')}</ToggleButton>
          <ToggleButton value={FILTER_PRESETS.thin}>{t('report.filter.thin')}</ToggleButton>
          <ToggleButton value={FILTER_PRESETS.contested}>{t('report.filter.contested')}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
    </Box>
  );
}

ReportComponentFilterBar.propTypes = {
  reportScope: PropTypes.string,
  filterState: PropTypes.shape({
    preset: PropTypes.string,
    selectedComponentIds: PropTypes.arrayOf(PropTypes.string),
  }),
  onFilterChange: PropTypes.func,
};

export { readStoredFilter as readReportComponentFilter };
