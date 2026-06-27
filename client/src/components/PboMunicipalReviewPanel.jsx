import { useMemo, useState } from 'react';
import Collapse from '@mui/material/Collapse';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LoadingState, ErrorState } from '../ui/index.js';
import { reviewStatusLabel, reviewStatusTone, useMunicipalPboReviewDetail } from '../hooks/useMunicipalPboReviews.js';
import { usePboHistoricalSearch } from '../hooks/usePboHistoricalSearch.js';
import PropTypes from 'prop-types';

function gapKindLabel(kind, t) {
  const key = `pboReview.gapKind.${kind}`;
  const translated = t(key);
  return translated === key ? kind : translated;
}

function ReviewMetaRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      <Typography variant="eyebrow" color="text.secondary">{label}</Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}

ReviewMetaRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

export function PboMunicipalReviewPanel({
  date,
  municipality,
  districtId,
  getIdToken,
  getAppCheckToken,
  apiReady,
  onSubmitted,
  summary = null,
  showHistoricalSearch = false,
}) {
  const { t, lang } = useLanguage();
  const { hits: historyHits, loading: historyLoading, error: historyError, search: searchHistory } = usePboHistoricalSearch({
    lang,
    getIdToken,
    getAppCheckToken,
    apiReady,
  });
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const { detail, loading, error, submitReply } = useMunicipalPboReviewDetail({
    date,
    municipality,
    lang,
    getIdToken,
    getAppCheckToken,
    apiReady,
  });
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitOk, setSubmitOk] = useState(false);

  const review = detail ?? summary;
  const openQuestions = useMemo(() => {
    if (!detail?.questions?.length) return [];
    return detail.questions;
  }, [detail]);

  const gaps = detail?.gaps ?? summary?.gaps ?? [];
  const isComplete = review?.sufficient || review?.status === 'resolved';
  const needsFollowUp = review && !isComplete;

  if (loading) return <LoadingState>{t('pboReview.loading')}</LoadingState>;
  if (error) return <ErrorState>{error}</ErrorState>;

  if (!review) {
    return (
      <Stack spacing={1.5}>
        <Alert severity="info">{t('pboReview.notReviewedYet')}</Alert>
        <Typography variant="body2" color="text.secondary">
          {t('pboReview.pipelineHint')}
        </Typography>
      </Stack>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitOk(false);
    try {
      const payload = openQuestions.map((q) => ({
        gapId: q.gapId,
        text: String(answers[q.gapId] ?? '').trim(),
      })).filter((a) => a.text);
      if (!payload.length) {
        setSubmitError(t('pboReview.replyRequired'));
        return;
      }
      await submitReply(payload);
      setSubmitOk(true);
      setAnswers({});
      onSubmitted?.();
    } catch (e) {
      setSubmitError(e?.message ?? t('pboReview.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleHistorySearch(event) {
    event.preventDefault();
    if (!historyQuery.trim()) return;
    setHistoryOpen(true);
    await searchHistory({
      query: historyQuery,
      date,
      municipality,
      district: districtId,
    });
  }

  return (
    <Stack spacing={2} component="section" aria-label={t('pboReview.reportSection')}>
      {showHistoricalSearch && (
        <Box component="form" onSubmit={(e) => { void handleHistorySearch(e); }}>
          <Typography variant="eyebrow" color="text.secondary" sx={{ marginBottom: 0.75 }}>
            {t('pboReview.historicalSearchTitle')}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap>
            <TextField
              size="small"
              fullWidth
              placeholder={t('pboReview.historicalSearchPlaceholder')}
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
            />
            <Button type="submit" size="small" variant="outlined" disabled={historyLoading}>
              {historyLoading ? '…' : t('pboReview.historicalSearchSubmit')}
            </Button>
          </Stack>
          {historyError && <Alert severity="warning" sx={{ mt: 1 }}>{historyError}</Alert>}
          <Collapse in={historyOpen && historyHits.length > 0}>
            <List dense sx={{ mt: 1 }}>
              {historyHits.map((h) => (
                <ListItem key={`${h.source_id}:${h.chunk_index}`} disablePadding sx={{ py: 0.5 }}>
                  <ListItemText
                    primary={`[${h.date ?? ''}] ${h.title ?? h.source_id}`}
                    secondary={h.snippet}
                    primaryTypographyProps={{ variant: 'caption', fontWeight: 600 }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              ))}
            </List>
          </Collapse>
        </Box>
      )}

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip
          size="small"
          label={reviewStatusLabel(review, t)}
          color={reviewStatusTone(review)}
          variant="filled"
        />
        {gaps.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('pboReview.gapsFound', { n: gaps.length })}
          </Typography>
        )}
      </Stack>

      <ReviewMetaRow label={t('pboReview.statusLabel')} value={reviewStatusLabel(review, t)} />
      {review.emailSentAt && (
        <ReviewMetaRow label={t('pboReview.emailSentLabel')} value={review.emailSentAt} />
      )}

      {isComplete && (
        <Alert severity="success">{t('pboReview.completeMessage')}</Alert>
      )}

      {gaps.length > 0 && (
        <Box>
          <Typography variant="eyebrow" color="text.secondary" sx={{ marginBottom: 0.75 }}>
            {t('pboReview.gapsTitle')}
          </Typography>
          <List dense disablePadding sx={{ listStyle: 'none' }}>
            {gaps.map((gap) => (
              <ListItem
                key={gap.id}
                disablePadding
                sx={(theme) => ({
                  paddingTop: theme.spacing(0.5),
                  paddingBottom: theme.spacing(0.5),
                  borderBottom: theme.custom.border.hairline,
                  '&:last-child': { borderBottom: 'none' },
                })}
              >
                <ListItemText
                  primary={gap.componentId ? (openQuestions.find((q) => q.gapId === gap.id)?.label || gap.componentId) : t('pboReview.gapKind.sparse_row')}
                  secondary={gapKindLabel(gap.kind, t)}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {openQuestions.length > 0 && (
        <Box>
          <Typography variant="eyebrow" color="text.secondary" sx={{ marginBottom: 0.75 }}>
            {t('pboReview.followUpTitle')}
          </Typography>
          <Stack component="ol" spacing={1.25} sx={{ paddingInlineStart: 2.5, margin: 0 }}>
            {openQuestions.map((q) => (
              <Box component="li" key={q.gapId}>
                {q.label && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {q.label}
                  </Typography>
                )}
                <Typography variant="body2">{q.text}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {(detail?.replies ?? []).length > 0 && (
        <Box>
          <Typography variant="eyebrow" color="text.secondary" sx={{ marginBottom: 0.75 }}>
            {t('pboReview.priorReplies')}
          </Typography>
          <Stack spacing={1}>
            {detail.replies.map((reply) => (
              <Box
                key={reply.id}
                sx={(theme) => ({
                  padding: theme.spacing(1),
                  borderRadius: `${theme.custom.radius.section}px`,
                  background: theme.palette.background.default,
                  border: theme.custom.border.hairline,
                })}
              >
                <Typography variant="caption" color="text.secondary" display="block">
                  [{reply.channel}] {reply.receivedAt}
                </Typography>
                <Typography variant="body2">
                  {reply.rawText || (reply.answers ?? []).map((a) => a.text).join(' · ')}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {needsFollowUp && openQuestions.length > 0 && (
        <Box component="form" onSubmit={(e) => { void handleSubmit(e); }}>
          <Typography variant="eyebrow" color="text.secondary" sx={{ marginBottom: 1 }}>
            {t('pboReview.replyFormTitle')}
          </Typography>
          <Stack spacing={1.5}>
            {openQuestions.map((q) => (
              <TextField
                key={`answer-${q.gapId}`}
                label={q.label || q.text.slice(0, 60)}
                multiline
                minRows={2}
                fullWidth
                size="small"
                value={answers[q.gapId] ?? ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.gapId]: e.target.value }))}
              />
            ))}
            {submitError && <Alert severity="error">{submitError}</Alert>}
            {submitOk && <Alert severity="success">{t('pboReview.submitOk')}</Alert>}
            <Button type="submit" variant="contained" size="small" disabled={submitting}>
              {submitting ? t('pboReview.submitting') : t('pboReview.submit')}
            </Button>
          </Stack>
        </Box>
      )}

      {!detail && summary && (
        <Typography variant="body2" color="text.secondary">
          {t('pboReview.summaryOnlyHint')}
        </Typography>
      )}
    </Stack>
  );
}

PboMunicipalReviewPanel.propTypes = {
  date: PropTypes.string,
  municipality: PropTypes.string,
  districtId: PropTypes.string,
  getIdToken: PropTypes.func,
  getAppCheckToken: PropTypes.func,
  apiReady: PropTypes.bool,
  onSubmitted: PropTypes.func,
  summary: PropTypes.object,
  showHistoricalSearch: PropTypes.bool,
};
