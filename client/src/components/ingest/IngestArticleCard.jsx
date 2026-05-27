import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';
import { alpha, useTheme } from '@mui/material/styles';
import { translationFnPropType } from '../../lib/reportPropTypes.js';

const BODY_PREVIEW_CHARS = 480;

function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url ?? '').trim());
}

export function IngestArticleCard({
  title,
  body,
  source,
  publishedAt,
  url,
  secondaryLabel,
  t,
}) {
  const theme = useTheme();
  const preview = String(body ?? '').length > BODY_PREVIEW_CHARS
    ? `${String(body).slice(0, BODY_PREVIEW_CHARS)}…`
    : String(body ?? '');

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        borderColor: alpha(theme.palette.primary.main, 0.18),
      }}
    >
      <CardContent>
        <Stack spacing={1.25}>
          <Typography variant="subtitle1" dir="auto" sx={{ fontWeight: 600, lineHeight: 1.45 }}>
            {title}
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center">
            {source && <Chip size="small" label={source} />}
            {secondaryLabel && <Chip size="small" variant="outlined" label={secondaryLabel} />}
            {publishedAt && (
              <Chip size="small" variant="outlined" label={publishedAt} />
            )}
          </Stack>
          {preview && (
            <Typography variant="body2" dir="auto" color="text.secondary" sx={{ lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
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
  source: PropTypes.string,
  publishedAt: PropTypes.string,
  url: PropTypes.string,
  secondaryLabel: PropTypes.string,
  t: translationFnPropType,
};
