import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import { SOCIAL_MEDIA_CATEGORY_LABEL_KEYS } from '../../constants/socialMediaCategoryLabels.js';
import PropTypes from 'prop-types';
import { translationFnPropType } from '../../lib/reportPropTypes.js';

export function SocialMediaPostCard({ post, t }) {
  const theme = useTheme();
  const categoryLabel = post.categoryId
    ? t(SOCIAL_MEDIA_CATEGORY_LABEL_KEYS[post.categoryId] ?? 'socialMedia.category.other')
    : null;
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
          <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center">
            {post.location && <Chip size="small" label={post.location} />}
            <Chip size="small" variant="outlined" label={post.platform || '—'} />
            {post.confidence && <Chip size="small" variant="outlined" label={post.confidence} />}
            {categoryLabel && (
              <Chip size="small" color="primary" variant="outlined" label={categoryLabel} />
            )}
          </Stack>
          <Typography
            variant="body1"
            dir="auto"
            sx={{
              lineHeight: 1.65,
              fontStyle: 'italic',
              borderLeft: `3px solid ${alpha(theme.palette.primary.main, 0.35)}`,
              pl: 1.5,
            }}
          >
            {post.text}
          </Typography>
          {post.behaviorOrEmotion && (
            <Typography variant="body2" color="text.secondary" dir="auto">
              {post.behaviorOrEmotion}
            </Typography>
          )}
          {post.textOriginal && post.textOriginal !== post.text && (
            <Typography variant="caption" color="text.secondary" dir="auto" sx={{ display: 'block' }}>
              {t('socialMedia.originalQuote')}: {post.textOriginal}
            </Typography>
          )}
          {post.url && (
            <Link href={post.url} target="_blank" rel="noopener noreferrer" variant="body2">
              {t('socialMedia.sourceLink')}
            </Link>
          )}
          {Array.isArray(post.replies) && post.replies.length > 0 && (
            <Box sx={{ pl: 2, borderLeft: `2px solid ${alpha(theme.palette.divider, 0.8)}` }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                {(t('socialMedia.replies') || '').replace('{count}', String(post.replies.length))}
              </Typography>
              {post.replies.map((reply, idx) => (
                <Typography key={reply.id ?? idx} variant="body2" dir="auto" sx={{ mb: 0.5 }}>
                  {reply.text ?? reply.quote_original ?? ''}
                </Typography>
              ))}
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

SocialMediaPostCard.propTypes = {
  post: PropTypes.object.isRequired,
  t: translationFnPropType,
};
