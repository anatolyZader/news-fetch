import { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';
import { alpha, useTheme } from '@mui/material/styles';
import { formatPublishedDateTime } from '../../lib/date.js';
import { translationFnPropType } from '../../lib/reportPropTypes.js';
import { ShowOriginalToggle } from '../ShowOriginalToggle.jsx';
import { readShowOriginalPreference, writeShowOriginalPreference } from '../../hooks/useShowOriginalPreference.js';

const BODY_PREVIEW_CHARS = 480;

function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url ?? '').trim());
}

export function IngestArticleCard({
  title,
  body,
  titleOriginal,
  bodyOriginal,
  source,
  publishedAt,
  url,
  secondaryLabel,
  t,
  lang,
}) {
  const theme = useTheme();
  const [showOriginal, setShowOriginal] = useState(() => readShowOriginalPreference());
  const hasOriginal = Boolean(titleOriginal || bodyOriginal);
  const displayTitle = showOriginal && titleOriginal ? titleOriginal : title;
  const displayBody = showOriginal && bodyOriginal ? bodyOriginal : body;
  const preview = String(displayBody ?? '').length > BODY_PREVIEW_CHARS
    ? `${String(displayBody).slice(0, BODY_PREVIEW_CHARS)}…`
    : String(displayBody ?? '');
  const publishedLabel = publishedAt ? formatPublishedDateTime(publishedAt, lang) : null;

  function toggleOriginal() {
    setShowOriginal((prev) => {
      const next = !prev;
      writeShowOriginalPreference(next);
      return next;
    });
  }

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: `${theme.custom.radius.section}px`,
        borderColor: alpha(theme.palette.primary.main, 0.18),
      }}
    >
      <CardContent>
        <Stack spacing={1.25}>
          <Typography variant="subtitle1" dir="auto" sx={{ fontWeight: 600, lineHeight: 1.45 }}>
            {displayTitle}
          </Typography>
          {hasOriginal && (
            <ShowOriginalToggle
              showingOriginal={showOriginal}
              onToggle={toggleOriginal}
              t={t}
            />
          )}
          <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center">
            {source && <Chip size="small" label={source} />}
            {secondaryLabel && <Chip size="small" variant="outlined" label={secondaryLabel} />}
            {publishedLabel && (
              <Typography variant="caption" color="text.secondary">
                {publishedLabel}
              </Typography>
            )}
          </Stack>
          {preview && (
            <Typography variant="body2" dir="auto" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
              {preview}
            </Typography>
          )}
          {isHttpUrl(url) && (
            <Link href={url} target="_blank" rel="noopener noreferrer" variant="body2">
              {t('ingest.sourceLink')}
            </Link>
          )}
          {!isHttpUrl(url) && url && (
            <Box>
              <Typography variant="caption" color="text.secondary" dir="auto">
                {url}
              </Typography>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

IngestArticleCard.propTypes = {
  title: PropTypes.string,
  body: PropTypes.string,
  titleOriginal: PropTypes.string,
  bodyOriginal: PropTypes.string,
  source: PropTypes.string,
  publishedAt: PropTypes.string,
  url: PropTypes.string,
  secondaryLabel: PropTypes.string,
  t: translationFnPropType,
  lang: PropTypes.string,
};
