import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

import { StatusTag } from '../ui/index.js';

export function InstrumentMetricsBadges({ instrument, t, compact = false }) {
  const inst = instrument ?? {};
  if (inst.evidence_mass == null && inst.distinct_article_count == null) return null;

  const polBand = inst.polarization_band;
  const polKey = polBand ? `report.instrument.polarization.${polBand}` : null;

  return (
    <Stack
      direction="row"
      flexWrap="wrap"
      sx={(theme) => ({
        gap: theme.spacing(0.75),
        marginTop: compact ? 0 : theme.spacing(0.5),
        justifyContent: compact ? 'flex-end' : 'flex-start',
      })}
    >
      {inst.evidence_mass != null && inst.evidence_mass > 0 && (
        <Typography variant="caption" color="text.secondary">
          {t('report.instrument.mass').replace('{n}', String(inst.evidence_mass))}
        </Typography>
      )}
      {inst.distinct_article_count != null && inst.distinct_article_count > 0 && (
        <Typography variant="caption" color="text.secondary">
          {t('report.instrument.articles').replace('{n}', String(inst.distinct_article_count))}
        </Typography>
      )}
      {polKey && (
        <StatusTag variant={polBand === 'contested' ? 'alert' : 'neutral'}>
          {t(polKey)}
        </StatusTag>
      )}
      {inst.suppression_active && (
        <StatusTag variant="warning">{t('report.instrument.suppressionActive')}</StatusTag>
      )}
      {inst.certainty_band && (
        <Typography variant="caption" color="text.secondary">
          {t('report.instrument.certaintyBand').replace('{band}', t(`report.instrument.certainty.${inst.certainty_band}`))}
        </Typography>
      )}
    </Stack>
  );
}

InstrumentMetricsBadges.propTypes = {
  instrument: PropTypes.object,
  t: PropTypes.func.isRequired,
  compact: PropTypes.bool,
};
