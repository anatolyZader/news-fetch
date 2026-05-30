import { forwardRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useValidationReviewQueue } from '../hooks/useValidationReviewQueue.js';
import { simplifyMessagesForDisplay } from '../lib/anthropicMessageUtils.js';
import { StatusTag } from '../ui/index.js';

function formatTemplate(template, params = {}) {
  if (!template) return '';
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, value == null ? '—' : String(value)),
    template,
  );
}

export const ValidationReviewPanel = forwardRef(function ValidationReviewPanel(
  /** @type {{ reportDate?: string, reportScope?: string, enabled?: boolean }} */
  { reportDate, reportScope, enabled },
  ref,
) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(true);
  const {
    items,
    loading,
    error,
    savingKey,
    submitDecision,
    fetchContext,
    explainItem,
    agentTurn,
  } = useValidationReviewQueue(reportDate, reportScope, { enabled });

  const [expandedKey, setExpandedKey] = useState(null);
  const [contextByKey, setContextByKey] = useState({});
  const [contextLoading, setContextLoading] = useState(null);
  const [explainQ, setExplainQ] = useState('');
  const [explainAnswer, setExplainAnswer] = useState(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [agentMessagesByKey, setAgentMessagesByKey] = useState({});
  const [agentAnswerByKey, setAgentAnswerByKey] = useState({});
  const [agentRecommendationByKey, setAgentRecommendationByKey] = useState({});
  const [agentFollowUpByKey, setAgentFollowUpByKey] = useState({});
  const [agentLoadingKey, setAgentLoadingKey] = useState(null);
  const [reviewModeByKey, setReviewModeByKey] = useState({});

  function clearAgentState(articleKey) {
    setAgentMessagesByKey((prev) => {
      const next = { ...prev };
      delete next[articleKey];
      return next;
    });
    setAgentAnswerByKey((prev) => {
      const next = { ...prev };
      delete next[articleKey];
      return next;
    });
    setAgentRecommendationByKey((prev) => {
      const next = { ...prev };
      delete next[articleKey];
      return next;
    });
    setAgentFollowUpByKey((prev) => {
      const next = { ...prev };
      delete next[articleKey];
      return next;
    });
  }

  async function handleSubmitDecision(articleKey, action, payload = {}) {
    const result = await submitDecision(articleKey, action, payload);
    if (result) clearAgentState(articleKey);
    return result;
  }

  async function toggleExpand(articleKey) {
    if (expandedKey === articleKey) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(articleKey);
    setExplainAnswer(null);
    if (!contextByKey[articleKey]) {
      setContextLoading(articleKey);
      const ctx = await fetchContext(articleKey);
      if (ctx) setContextByKey((prev) => ({ ...prev, [articleKey]: ctx }));
      setContextLoading(null);
    }
  }

  async function handleExplain(articleKey) {
    setExplainLoading(true);
    const result = await explainItem(articleKey, explainQ);
    setExplainAnswer(result?.answer ?? null);
    setExplainLoading(false);
  }

  async function runAgentTurn(articleKey, followUp) {
    setAgentLoadingKey(articleKey);
    const prior = agentMessagesByKey[articleKey] ?? [];
    const result = await agentTurn(articleKey, prior, followUp ? { followUp } : {});
    if (result?.messages) {
      setAgentMessagesByKey((prev) => ({ ...prev, [articleKey]: result.messages }));
    }
    if (result?.answer) {
      setAgentAnswerByKey((prev) => ({ ...prev, [articleKey]: result.answer }));
    }
    if (result?.recommendation) {
      setAgentRecommendationByKey((prev) => ({ ...prev, [articleKey]: result.recommendation }));
    }
    if (followUp) {
      setAgentFollowUpByKey((prev) => ({ ...prev, [articleKey]: '' }));
    }
    setAgentLoadingKey(null);
  }

  async function handleInvestigate(articleKey) {
    await runAgentTurn(articleKey);
  }

  async function handleAgentFollowUp(articleKey) {
    const text = String(agentFollowUpByKey[articleKey] ?? '').trim();
    if (!text) return;
    await runAgentTurn(articleKey, text);
  }

  async function handleApplyRecommendation(articleKey) {
    const rec = agentRecommendationByKey[articleKey];
    if (!rec?.action) return;
    await handleSubmitDecision(articleKey, rec.action, { note: rec.rationale ?? '' });
  }

  if (!enabled) return null;

  function renderRagSection(title, lines) {
    if (!lines?.length) return null;
    return (
      <Box sx={{ marginTop: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>{title}</Typography>
        {lines.map((line) => (
          <Typography key={line} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {line}
          </Typography>
        ))}
      </Box>
    );
  }

  return (
    <Box
      ref={ref}
      component="section"
      aria-label={t('validationReview.panelTitle')}
      sx={(theme) => ({
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        overflow: 'hidden',
        background: theme.palette.background.paper,
      })}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={(theme) => ({
          padding: theme.spacing(1.25, 1.5),
          borderBottom: open ? theme.custom.border.hairline : 'none',
          background: theme.palette.action.hover,
          cursor: 'pointer',
        })}
        onClick={() => setOpen((v) => !v)}
      >
        <Typography variant="cardTitle" sx={{ flex: 1 }}>
          {t('validationReview.panelTitle')}
        </Typography>
        <StatusTag variant="neutral">
          {loading ? '…' : String(items.length)}
        </StatusTag>
        <IconButton
          size="small"
          aria-expanded={open}
          sx={{ transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Collapse in={open}>
        <Box sx={(theme) => ({ padding: theme.spacing(1.5) })}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginBottom: 1 }}>
            {t('validationReview.analystOnly')}
          </Typography>

          {error && (
            <Alert severity="error" variant="outlined" sx={{ marginBottom: 1 }}>
              {error}
            </Alert>
          )}

          {!loading && items.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {t('validationReview.empty')}
            </Typography>
          )}

          <Stack spacing={1.5}>
            {items.map((item) => {
              const isEpistemic = String(item.article_key ?? '').startsWith('__epistemic__:');
              return (
              <Box
                key={item.article_key}
                sx={(theme) => ({
                  border: theme.custom.border.hairline,
                  borderRadius: `${theme.custom.radius.section}px`,
                  padding: theme.spacing(1.25),
                })}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={0.5}
                  onClick={() => !isEpistemic && toggleExpand(item.article_key)}
                  sx={{ cursor: isEpistemic ? 'default' : 'pointer' }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                    {isEpistemic
                      ? t('validationReview.epistemic.title')
                      : `#${item.queue_rank} — ${item.article_source ?? item.article_key}`}
                  </Typography>
                  {!isEpistemic && (
                    <IconButton size="small" aria-label="expand">
                      <ExpandMoreIcon
                        fontSize="small"
                        sx={{ transform: expandedKey === item.article_key ? 'rotate(180deg)' : 'none' }}
                      />
                    </IconButton>
                  )}
                </Stack>
                {(item.reasons ?? []).slice(0, 3).map((r, idx) => (
                  <StatusTag key={`${item.article_key}-r-${idx}`} variant="neutral">
                    {r.code}
                  </StatusTag>
                ))}
                {!isEpistemic && (item.signals ?? []).slice(0, 1).map((s, idx) => (
                  <Typography
                    key={`${item.article_key}-s-${idx}`}
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', marginTop: 0.5 }}
                  >
                    {String(s.evidence ?? '').slice(0, 200)}
                  </Typography>
                ))}
                {isEpistemic && item.article_key === '__epistemic__:social_channel_quarantine' && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', marginTop: 0.5 }}>
                    {t('validationReview.epistemic.socialQuarantineDetail')}
                  </Typography>
                )}
                {!isEpistemic && expandedKey === item.article_key && (
                  <Box sx={{ marginTop: 1 }}>
                    {contextLoading === item.article_key && (
                      <Typography variant="caption" color="text.secondary">
                        {t('validationReview.loadingContext')}
                      </Typography>
                    )}
                    {contextByKey[item.article_key]?.rag && (
                      <>
                        {renderRagSection(
                          t('validationReview.rag.similar'),
                          (contextByKey[item.article_key].rag.similar_articles ?? []).map(
                            (a) => `${a.title ?? a.source_id}: ${a.snippet}`,
                          ),
                        )}
                        {contextByKey[item.article_key].rag.same_story && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {t('validationReview.rag.sameStory')}:{' '}
                            {contextByKey[item.article_key].rag.same_story.cluster_id}{' '}
                            (n={contextByKey[item.article_key].rag.same_story.member_count})
                          </Typography>
                        )}
                        {renderRagSection(
                          t('validationReview.rag.prior'),
                          (contextByKey[item.article_key].rag.prior_decisions ?? []).map(
                            (d) => `${d.date} ${d.action} — ${d.article_source ?? d.article_key}`,
                          ),
                        )}
                        {contextByKey[item.article_key].rag.oov_neighbors?.samples && renderRagSection(
                          t('validationReview.rag.oov'),
                          contextByKey[item.article_key].rag.oov_neighbors.samples,
                        )}
                        <Stack direction="row" spacing={0.5} sx={{ marginTop: 1 }}>
                          <Button
                            size="small"
                            variant={reviewModeByKey[item.article_key] === 'investigate' ? 'outlined' : 'contained'}
                            onClick={() => setReviewModeByKey((p) => ({ ...p, [item.article_key]: 'explain' }))}
                          >
                            {t('validationReview.explainSubmit')}
                          </Button>
                          <Button
                            size="small"
                            variant={reviewModeByKey[item.article_key] === 'investigate' ? 'contained' : 'outlined'}
                            onClick={() => setReviewModeByKey((p) => ({ ...p, [item.article_key]: 'investigate' }))}
                          >
                            {t('validationReview.investigate.mode')}
                          </Button>
                        </Stack>
                        {reviewModeByKey[item.article_key] !== 'investigate' && (
                        <Stack direction="row" spacing={0.5} sx={{ marginTop: 1 }}>
                          <TextField
                            size="small"
                            fullWidth
                            placeholder={t('validationReview.explainPlaceholder')}
                            value={expandedKey === item.article_key ? explainQ : ''}
                            onChange={(e) => setExplainQ(e.target.value)}
                          />
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={explainLoading}
                            onClick={() => handleExplain(item.article_key)}
                          >
                            {t('validationReview.explainSubmit')}
                          </Button>
                        </Stack>
                        )}
                        {reviewModeByKey[item.article_key] !== 'investigate' && explainAnswer && expandedKey === item.article_key && (
                          <Alert severity="info" variant="outlined" sx={{ marginTop: 1 }}>
                            {explainAnswer}
                          </Alert>
                        )}
                        {reviewModeByKey[item.article_key] === 'investigate' && (
                          <Box sx={{ marginTop: 1 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={agentLoadingKey === item.article_key}
                              onClick={() => handleInvestigate(item.article_key)}
                            >
                              {agentLoadingKey === item.article_key
                                ? '…'
                                : t('validationReview.investigate.run')}
                            </Button>
                            {(agentMessagesByKey[item.article_key] ?? []).length > 0 && (
                              <Box sx={{ marginTop: 1 }}>
                                {simplifyMessagesForDisplay(agentMessagesByKey[item.article_key]).map((turn, idx) => (
                                  <Alert
                                    key={`${item.article_key}-turn-${idx}`}
                                    severity={turn.role === 'user' ? 'info' : 'success'}
                                    variant="outlined"
                                    sx={{ marginTop: 0.75 }}
                                  >
                                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                                      {turn.role === 'user'
                                        ? t('validationReview.investigate.you')
                                        : t('validationReview.investigate.agent')}
                                    </Typography>
                                    {turn.text}
                                  </Alert>
                                ))}
                              </Box>
                            )}
                            {agentAnswerByKey[item.article_key] && !(agentMessagesByKey[item.article_key]?.length) && (
                              <Alert severity="info" variant="outlined" sx={{ marginTop: 1 }}>
                                {agentAnswerByKey[item.article_key]}
                              </Alert>
                            )}
                            {agentRecommendationByKey[item.article_key] && (
                              <Alert severity="warning" variant="outlined" sx={{ marginTop: 1 }}>
                                {formatTemplate(t('validationReview.investigate.recommended'), {
                                  action: agentRecommendationByKey[item.article_key].action,
                                  rationale: agentRecommendationByKey[item.article_key].rationale,
                                })}
                                <Button
                                  size="small"
                                  variant="contained"
                                  sx={{ marginTop: 0.75, display: 'block' }}
                                  disabled={savingKey === item.article_key}
                                  onClick={() => handleApplyRecommendation(item.article_key)}
                                >
                                  {formatTemplate(t('validationReview.investigate.applyRecommendation'), {
                                    action: agentRecommendationByKey[item.article_key].action,
                                  })}
                                </Button>
                              </Alert>
                            )}
                            {(agentMessagesByKey[item.article_key] ?? []).length > 0 && (
                              <Stack direction="row" spacing={0.5} sx={{ marginTop: 1 }}>
                                <TextField
                                  size="small"
                                  fullWidth
                                  placeholder={t('validationReview.investigate.followUpPlaceholder')}
                                  value={agentFollowUpByKey[item.article_key] ?? ''}
                                  onChange={(e) => setAgentFollowUpByKey((prev) => ({
                                    ...prev,
                                    [item.article_key]: e.target.value,
                                  }))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      void handleAgentFollowUp(item.article_key);
                                    }
                                  }}
                                />
                                <Button
                                  size="small"
                                  variant="outlined"
                                  disabled={
                                    agentLoadingKey === item.article_key
                                    || !String(agentFollowUpByKey[item.article_key] ?? '').trim()
                                  }
                                  onClick={() => handleAgentFollowUp(item.article_key)}
                                >
                                  {t('validationReview.investigate.followUpSubmit')}
                                </Button>
                              </Stack>
                            )}
                          </Box>
                        )}
                      </>
                    )}
                  </Box>
                )}
                <Stack direction="row" spacing={0.75} sx={{ marginTop: 1, flexWrap: 'wrap' }}>
                  {isEpistemic && item.article_key === '__epistemic__:social_channel_quarantine' ? (
                    <>
                      <Button
                        size="small"
                        variant="contained"
                        color="warning"
                        disabled={savingKey === item.article_key}
                        onClick={() => handleSubmitDecision(item.article_key, 'confirm_social_quarantine', {})}
                      >
                        {t('validationReview.action.confirmSocialQuarantine')}
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        disabled={savingKey === item.article_key}
                        onClick={() => handleSubmitDecision(item.article_key, 'dismiss_social_quarantine', {})}
                      >
                        {t('validationReview.action.dismissSocialQuarantine')}
                      </Button>
                    </>
                  ) : (
                    <>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={savingKey === item.article_key}
                    onClick={() => handleSubmitDecision(item.article_key, 'label', { note: '' })}
                  >
                    {t('validationReview.action.label')}
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    disabled={savingKey === item.article_key}
                    onClick={() => handleSubmitDecision(item.article_key, 'skip')}
                  >
                    {t('validationReview.action.skip')}
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    disabled={savingKey === item.article_key}
                    onClick={() => handleSubmitDecision(item.article_key, 'defer')}
                  >
                    {t('validationReview.action.defer')}
                  </Button>
                    </>
                  )}
                </Stack>
              </Box>
            );
            })}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
});
