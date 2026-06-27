import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';
import { ShowOriginalToggle } from './ShowOriginalToggle.jsx';
import { MarkdownArticle } from '../ui/MarkdownArticle.jsx';
import { readShowOriginalPreference, writeShowOriginalPreference } from '../hooks/useShowOriginalPreference.js';
import { translationFnPropType } from '../lib/reportPropTypes.js';

/**
 * Renders localized text with optional original toggle when `original` is present.
 */
export function LocalizedTextBlock({
  text,
  original,
  t,
  variant = 'body2',
  markdown = false,
  markdownVariant = 'doc',
  component = 'div',
  sx,
  showOriginal: showOriginalProp,
  onToggle,
  hideToggle = false,
}) {
  const [localShowOriginal, setLocalShowOriginal] = useState(() => readShowOriginalPreference());
  const controlled = showOriginalProp != null;
  const showOriginal = controlled ? showOriginalProp : localShowOriginal;
  const hasOriginal = Boolean(original && original !== text);
  const display = showOriginal && hasOriginal ? original : text;

  function toggle() {
    if (onToggle) {
      onToggle();
      return;
    }
    setLocalShowOriginal((prev) => {
      const next = !prev;
      writeShowOriginalPreference(next);
      return next;
    });
  }

  if (!display) return null;

  return (
    <Box sx={sx}>
      {hasOriginal && !hideToggle && (
        <ShowOriginalToggle showingOriginal={showOriginal} onToggle={toggle} t={t} />
      )}
      {markdown ? (
        <MarkdownArticle variant={markdownVariant}>{display}</MarkdownArticle>
      ) : (
        <Typography variant={variant} component={component}>
          {display}
        </Typography>
      )}
    </Box>
  );
}

LocalizedTextBlock.propTypes = {
  text: PropTypes.string,
  original: PropTypes.string,
  t: translationFnPropType,
  variant: PropTypes.string,
  markdown: PropTypes.bool,
  markdownVariant: PropTypes.oneOf(['doc', 'report']),
  component: PropTypes.elementType,
  showOriginal: PropTypes.bool,
  onToggle: PropTypes.func,
  hideToggle: PropTypes.bool,
};
