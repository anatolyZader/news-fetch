import PropTypes from 'prop-types';
import Button from '@mui/material/Button';

/**
 * Toggle between localized text and preserved original (server `*Original` fields).
 */
export function ShowOriginalToggle({ showingOriginal, onToggle, t }) {
  const label = showingOriginal
    ? (t?.('locale.showTranslated') ?? 'Show translation')
    : (t?.('locale.showOriginal') ?? 'Show original');
  return (
    <Button size="small" variant="text" onClick={onToggle} sx={{ alignSelf: 'flex-start', minWidth: 0, px: 0.5 }}>
      {label}
    </Button>
  );
}

ShowOriginalToggle.propTypes = {
  showingOriginal: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  t: PropTypes.func,
};
